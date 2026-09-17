import {describe,it,expect} from 'vitest';
import {createWorker,type D1,type MarketplaceAdapter} from '../src/index';

class Db implements D1 { prepare(_sql:string){ const statement:any={bind:()=>statement,first:async()=>null,run:async()=>({meta:{changes:1}})}; return statement; } }
class Adapter implements MarketplaceAdapter {
  async getQuestion(){ return {id:'q',item_id:'TST100000001',seller_id:'10000001',status:'UNANSWERED',text:'question'}; }
  async listQuestions(){ return []; }
  async answerQuestion(){}
  async getItem(){ return {id:'TST100000001',seller_id:'10000001',status:'active',attributes:[]}; }
  async putItemAttributes(){}
  async getItemModeration(){ return {id:'TST100000001',status:'active',sub_status:[],non_selling_reason:null}; }
}
const env:any={DB:new Db(),INTERNAL_AUTH_TOKEN:'internal',RECEIPT_ROOT_KEY:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};
const url='https://example.test/internal/products/demo_widget';
const worker=()=>createWorker({adapter:()=>new Adapter()});
const post=(path:string,body?:BodyInit|null,contentType='application/json')=>worker().fetch(new Request(url+path,{method:'POST',headers:{authorization:'Bearer internal','content-type':contentType},body}),env);

describe('router request validation',()=>{
  it.each([
    ['/questions/prepare',null],
    ['/questions/prepare','null'],
    ['/questions/prepare','[]'],
    ['/questions/prepare','{}'],
    ['/questions/prepare','{"id":1,"text":"answer"}'],
    ['/questions/prepare','{"id":"q","text":1}'],
    ['/questions/apply',null],
    ['/questions/apply','null'],
    ['/questions/apply','[]'],
    ['/questions/apply','{"id":"q","receipt_id":"r","text":"answer","hash":"h"}'],
    ['/attributes/prepare','null'],
    ['/attributes/prepare','[]'],
    ['/attributes/apply','{}'],
    ['/attributes/apply','{"receipt_id":1,"hash":"h","approval":"ok"}'],
  ])('returns 400 invalid_request for invalid %s body',async(path,body)=>{
    const response=await post(path,body as any);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({error:'invalid_request'});
  });
  it('returns 404 for an unknown configured product',async()=>{
    const response=await worker().fetch(new Request('https://example.test/internal/products/nope/attributes/prepare',{method:'POST',headers:{authorization:'Bearer internal','content-type':'application/json'},body:'{}'}),env);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ok:false,reason:'product_not_found'});
  });
  it('returns 503 for unavailable receipt signing material',async()=>{
    const response=await worker().fetch(new Request(url+'/questions/prepare',{method:'POST',headers:{authorization:'Bearer internal','content-type':'application/json'},body:'{"id":"q","text":"answer"}'}),{...env,RECEIPT_ROOT_KEY:'bad'});
    expect(response.status).toBe(503);
  });
  it('maps malformed provider projections to 502',async()=>{
    const bad=createWorker({adapter:()=>({...(new Adapter()),getQuestion:async()=>{throw Error('question_contract_changed')}}) as unknown as MarketplaceAdapter});
    const response=await bad.fetch(new Request(url+'/questions/prepare',{method:'POST',headers:{authorization:'Bearer internal','content-type':'application/json'},body:'{"id":"q","text":"answer"}'}),env);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({error:'unknown_shape'});
  });
  it('maps unavailable upstream to 503',async()=>{
    const unavailable=createWorker({adapter:()=>({...(new Adapter()),getQuestion:async()=>{throw Error('upstream_429')}}) as unknown as MarketplaceAdapter});
    const response=await unavailable.fetch(new Request(url+'/questions/prepare',{method:'POST',headers:{authorization:'Bearer internal','content-type':'application/json'},body:'{"id":"q","text":"answer"}'}),env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({error:'upstream_unavailable'});
  });
});
