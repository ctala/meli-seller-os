import {describe,it,expect} from 'vitest';
import {HttpMarketplaceAdapter,EnvAccessTokenProvider,Service,type D1,type MarketplaceAdapter} from '../src/index';

class AtomicD1 implements D1 {
  seen:any[]=[]; events:any[]=[]; snapshots:any[]=[]; aliases=new Map([['exact','d1']]);
  prepare(sql:string){ let vals:any[]=[]; const self=this; const st:any={bind(...v:any[]){vals=v;return st},async first(){
    if(sql.includes('product_aliases')) { const product_key=self.aliases.get(vals[0]); return product_key?{product_key,seller_id:'10000003',item_id:'TST3',config_json:JSON.stringify({aliases:['exact'],version:'v1',attributes:[]})}:null; }
    if(sql.includes('moderation_events')) return self.events.filter(x=>x.product_key===vals[0]).at(-1)||null;
    return null;
  },async run(){ let changes=1;
    if(sql.includes('INSERT INTO qa_seen')) { if(self.seen.some(x=>x.product_key===vals[0]&&x.question_id===vals[1])) changes=0; else self.seen.push({product_key:vals[0],question_id:vals[1]}); }
    if(sql.includes('INSERT INTO moderation_events')) { if(self.events.some(x=>x.product_key===vals[0]&&x.digest===vals[2])) changes=0; else self.events.push({product_key:vals[0],prior_digest:vals[1],digest:vals[2]}); }
    if(sql.includes('INSERT INTO moderation_snapshots')) { if(self.snapshots.some(x=>x.product_key===vals[0]&&x.digest===vals[1])) changes=0; else self.snapshots.push({product_key:vals[0],digest:vals[1]}); }
    return {meta:{changes}};
  }}; return st; }
}
class Meli implements MarketplaceAdapter { question:any={id:'q',item_id:'TST100000001',seller_id:'10000001',status:'UNANSWERED',text:'hello'}; mod:any={id:'TST100000001',status:'active',sub_status:[],non_selling_reason:null}; async getQuestion(){return structuredClone(this.question)} async listQuestions(){return [structuredClone(this.question)]} async answerQuestion(){} async getItem(){return {id:'TST100000001',seller_id:'10000001',attributes:[]}} async putItemAttributes(){} async getItemModeration(){return structuredClone(this.mod)} }
const env=(DB:D1)=>({DB,PRODUCT_REGISTRY_JSON:JSON.stringify([{product_key:'demo_widget',aliases:['widget'],seller_id:'10000001',item_id:'TST100000001',version:'v1',attributes:[]}])});
describe('final audit atomic boundaries',()=>{
 it('uses one atomic q&a winner under Promise.all',async()=>{const db=new AtomicD1(),m=new Meli(),s=new Service(env(db),m);const r=await Promise.all([s.pollQuestions('demo_widget'),s.pollQuestions('demo_widget')]);expect(r.filter(x=>x.created===1)).toHaveLength(1);expect(r.filter(x=>x.deduped===1)).toHaveLength(1);expect(db.seen).toHaveLength(1)});
 it.each(['%','_','act','unknown'])('D1 aliases require exact equality: %s',async key=>{const s:any=new Service(env(new AtomicD1()),new Meli());expect(await s.product(key)).toBeNull()});
 it('loads a normalized exact D1 alias',async()=>{const s:any=new Service({DB:new AtomicD1()} as any,new Meli());expect(await s.product('exact')).toMatchObject({product_key:'d1',item_id:'TST3'})});
 it('returns one moderation winner under Promise.all',async()=>{const db=new AtomicD1(),s=new Service(env(db),new Meli());const r=await Promise.all([s.pollModeration('demo_widget'),s.pollModeration('demo_widget')]);expect(r.filter(x=>x.changed)).toHaveLength(1);expect(db.events).toHaveLength(1)});
});
describe('bounded production projections',()=>{
 const token=new EnvAccessTokenProvider('t'); const adapter=(body:any)=>new HttpMarketplaceAdapter(token,async()=>new Response(JSON.stringify(body),{status:200}));
 it.each([{id:1,item_id:'i',seller_id:'s',status:'UNANSWERED',text:'x'},{id:'q',item_id:'i',seller_id:{},status:'UNANSWERED',text:'x'},{id:'q',item_id:'i',seller_id:'s',status:'UNANSWERED',text:7}])('rejects malformed question fields',async body=>await expect(adapter(body).getQuestion('q')).rejects.toThrow('question_contract_changed'));
 it.each([{id:'i',seller_id:1,status:'active',attributes:[]},{id:'i',seller_id:'s',status:'active',attributes:[{id:1,value_name:'x'}]},{id:'i',seller_id:'s',status:'active',attributes:'bad'}])('rejects malformed item fields',async body=>await expect(adapter(body).getItem('i')).rejects.toThrow('item_contract_changed'));
 it('list rejects a malformed member',async()=>await expect(adapter({questions:[{id:'q',item_id:'i',seller_id:'s',status:'UNANSWERED',text:1}]}).listQuestions('i')).rejects.toThrow('question_contract_changed'));
 it('rejects malformed answer projection',async()=>await expect(adapter({id:'q',item_id:'i',seller_id:'s',status:'UNANSWERED',text:'x',answer:{text:1}}).getQuestion('q')).rejects.toThrow('question_contract_changed'));
 it('rejects non-string item id',async()=>await expect(adapter({id:1,seller_id:'s',status:'active',attributes:[]}).getItem('i')).rejects.toThrow('item_contract_changed'));
 it('rejects malformed moderation reason',async()=>await expect(adapter({id:'i',status:'active',sub_status:[],non_selling_reason:{}}).getItemModeration('i')).rejects.toThrow('moderation_contract_changed'));
});
