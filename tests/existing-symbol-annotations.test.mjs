import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EXISTING_SYMBOL_ANNOTATIONS as annotations} from '../past-exams/existing-symbol-annotations.mjs';
import {SYMBOLS,annotateText} from '../past-exams/inline-symbols.mjs';
const qs=new Map(JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url))).exams.flatMap(e=>e.questions).map(q=>[q.id,q]));
const get=(id,c)=>annotations.question[id][JSON.stringify(['explanation','options',c])];
test('supplemental symbol references have exact current text, valid anchors and definitions',()=>{
 let fields=0,refs=0;
 for(const [id,items] of Object.entries(annotations.question))for(const [path,record]of Object.entries(items)){
  fields++;assert.equal(record.text,JSON.parse(path).reduce((value,k)=>value[k],qs.get(id)),id+path);
  for(const ref of record.refs){refs++;assert.ok(SYMBOLS[ref.symbolId],ref.symbolId);assert.equal(ref.occurrence,1);assert.ok(record.text.includes(ref.anchor),id+ref.anchor);}
 }
 assert.ok(fields>=144);assert.ok(refs>=159);
});
test('earth terminal and combined earth pin/terminal examples are not conflated',()=>{
 assert.equal(get('d2-20241027-45','ハ').refs[0].symbolId,'socket-ET');
 assert.equal(get('d2-20241027-45','ニ').refs[0].symbolId,'socket-EET');
 for(const id of ['d2-20190602-34','d2-20251026-32']){
  const refs=Object.values(annotations.question[id]).flatMap(x=>x.refs.map(r=>r.symbolId));
  assert.ok(refs.includes('socket-E'));assert.ok(refs.includes('socket-ET'));assert.ok(refs.includes('socket-EET'));
 }
});
test('general junction boxes stay distinct from VVF boxes and pull boxes',()=>{
 assert.equal(get('d2-20221030-am-36','イ').refs[0].symbolId,'box-junction');
 assert.equal(get('d2-20221030-am-36','ロ').refs[0].symbolId,'box-cable');
 assert.equal(get('d2-20221030-am-36','ハ').refs[0].symbolId,'box-pull');
 assert.equal(get('d2-20220529-pm-37','ロ').refs[0].symbolId,'box-cable');
});
test('text changes fail closed without mutating existing explanation',()=>{
 const record=get('d2-20241027-45','ニ');let touched=false;
 const node={replaceChildren(){touched=true;},append(){touched=true;}};
 assert.equal(annotateText(node,record.text+' changed',{kind:'question',id:'d2-20241027-45',path:['explanation','options','ニ']},{annotations}),0);
 assert.equal(touched,false);
});
