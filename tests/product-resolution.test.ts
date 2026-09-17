import {describe,it,expect} from 'vitest';
import {Service,type D1,type MarketplaceAdapter} from '../src/index';

class RegistryD1 implements D1 {
  constructor(private rows:{byKey?:any;byAlias?:any}={}){}
  prepare(sql:string){
    let values:any[]=[];
    const statement:any={
      bind(...v:any[]){values=v;return statement;},
      first:async()=>sql.includes('WHERE p.product_key=?') ? (this.rows.byKey ?? null) : (this.rows.byAlias ?? null),
      run:async()=>({meta:{changes:1}}),
    };
    return statement;
  }
}
class Adapter implements MarketplaceAdapter {
  async getQuestion(){throw Error('unused');} async listQuestions(){return [];} async answerQuestion(){} async getItem(){throw Error('unused');} async putItemAttributes(){} async getItemModeration(){throw Error('unused');}
}
const definition=(key:string,aliases:string[]=[])=>( {product_key:key,aliases,seller_id:'10000001',item_id:'TST100000001',version:'v1',attributes:[]} );
const row=(key:string,aliases:string[]=[])=>({product_key:key,seller_id:'10000001',item_id:'TST100000001',config_json:JSON.stringify({aliases,version:'v1',attributes:[]})});
const product=async(db:D1,registry?:unknown,key='target')=>await (new Service({DB:db,PRODUCT_REGISTRY_JSON:registry===undefined?undefined:JSON.stringify(registry)} as any,new Adapter()) as any).product(key);

describe('deterministic product resolution',()=>{
  it('uses an exact D1 product key before an alias query',async()=>{
    const found=await product(new RegistryD1({byKey:row('target'),byAlias:row('other',['target'])}),undefined,'target');
    expect(found).toMatchObject({product_key:'target'});
  });
  it.each(['%','_','target%','target_','literal%','literal_','%literal','_literal'])('does not treat aliases as patterns: %s',async key=>{
    expect(await product(new RegistryD1(),[definition('target',['literal'])],key)).toBeNull();
  });
  it('fails closed for an alias-to-product-key collision in environment registry',async()=>{
    expect(await product(new RegistryD1(),[definition('target'),definition('other',['target'])],'target')).toBeNull();
  });
  it('fails closed when an authoritative D1 exact row is invalid instead of falling through',async()=>{
    const invalid={...row('target'),config_json:'not-json'};
    expect(await product(new RegistryD1({byKey:invalid}),[definition('target')],'target')).toBeNull();
  });
  it('falls through when D1 has no matching row',async()=>{
    expect(await product(new RegistryD1(),[definition('target')],'target')).toMatchObject({product_key:'target'});
  });
});
