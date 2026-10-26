import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SYMBOLS,annotationFor,annotateText,createInlineSymbol,enhanceTargets} from '../past-exams/inline-symbols.mjs';
import {ADDITIONAL_SYMBOL_ANNOTATIONS as extra} from '../past-exams/additional-symbol-annotations.mjs';
import {SYMBOL_VARIANTS} from '../past-exams/additional-symbols.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url)));
const qs=new Map(data.exams.flatMap(e=>e.questions).map(q=>[q.id,q]));
class Node{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.ownerDocument=doc;this.isConnected=true;}append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}setAttribute(k,v){this.attrs[k]=String(v)}set textContent(t){this.children=[String(t)]}get textContent(){return this.children.map(n=>typeof n==='string'?n:n.textContent).join('')}}
const doc={createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t)};
test('all new exact-text pins render their expected accessible SVGs',()=>{
 let count=0;
 for(const [id,fields]of Object.entries(extra.question))for(const [path,r]of Object.entries(fields)){
  const p=JSON.parse(path),text=p.reduce((v,k)=>v[k],qs.get(id));assert.equal(text,r.text,id+path);
  const node=new Node('p'),target={kind:'question',id,path:p};assert.deepEqual(annotationFor(target),r);
  assert.equal(annotateText(node,text,target),r.refs.length,id+path);
  for(const wrapper of node.children.filter(n=>n instanceof Node)){
   const svg=wrapper.children[0];assert.equal(svg.tag,'svg');assert.equal(svg.attrs.role,'img');assert.match(svg.attrs['aria-label'],/^図記号例：/);assert.equal(svg.attrs.focusable,'false');
  }count++;
 }assert.ok(count>=83);
});
test('reported lighting options retain four distinct comparisons',()=>{
 const get=c=>annotationFor({kind:'question',id:'d2-20240526-34',path:['explanation','options',c]}).refs.map(x=>x.symbolId);
 assert.deepEqual(get('イ'),['light-guidance']);assert.deepEqual(get('ロ'),['light-security']);assert.deepEqual(get('ハ'),['light-no-box','light-with-box']);assert.deepEqual(get('ニ'),['light-emergency']);
});
test('SVG geometry is closed and text never becomes markup',()=>{
 const allowed=new Set(['rect','circle','line','path','polygon','text']);
 for(const [id,d]of Object.entries(SYMBOLS)){const n=createInlineSymbol(doc,id);assert.ok(n);for(const [tag,attrs]of d.parts){assert.ok(allowed.has(tag));for(const k of Object.keys(attrs))assert.doesNotMatch(k,/^(?:on|href|style)/i);}}
 const text='<img src=x onerror=alert(1)> 接地極',target={kind:'question',id:'test',path:['test']},annotations={question:{test:{'["test"]':{text,refs:[{anchor:'接地極',occurrence:1,symbolId:'socket-E'}]}}}};
 const n=new Node('p');assert.equal(annotateText(n,text,target,{annotations}),1);assert.equal(n.children[0],text);assert.ok(n.children.every(x=>typeof x==='string'||x.tag==='span'));
});
test('stale, malformed, repeat and detached rendering fail safely',()=>{
 const target={kind:'question',id:'d2-20240526-34',path:['explanation','options','ロ']},r=annotationFor(target),n=new Node('p');n.append(r.text);
 assert.equal(annotateText(n,r.text+' changed',target),0);assert.equal(n.textContent,r.text);
 assert.equal(annotateText(n,r.text,target),1);assert.equal(annotateText(n,r.text,target),1);assert.equal(n.children.filter(x=>x instanceof Node).length,1);
 n.isConnected=false;assert.equal(enhanceTargets({isConnected:true},[{...target,node:n,text:r.text}]),0);
 assert.equal(createInlineSymbol(doc,'unknown'),null);
});
test('circle around S is an ammeter addition, not an electromagnetic switch',()=>{
 const q=qs.get('d2-20241027-40');assert.equal(q.answer,'イ');assert.match(q.explanation.options.ハ,/電流計付き開閉器/);assert.doesNotMatch(q.explanation.reasoning,/電磁開閉器/);
 assert.match(q.explanation.options.ハ,/電磁開閉器を意味しない/);
});
test('alternate notation is closed, labelled and collapsible without replacing the primary symbol',()=>{
 for(const [id,group]of Object.entries(SYMBOL_VARIANTS)){
  assert.ok(['equivalent','type-variant'].includes(group.kind));
  for(const alt of group.ids){assert.ok(SYMBOLS[alt]);assert.equal(SYMBOL_VARIANTS[alt],undefined,'no recursive alternative groups');}
  const node=createInlineSymbol(doc,id),primary=node.children[0],button=node.children.find(n=>n.tag==='button'),panel=node.children.at(-1);
  assert.equal(panel.hidden,true);assert.equal(button.attrs['aria-expanded'],'false');
  assert.match(button.textContent,group.kind==='equivalent'?/同じ意味/:/種類による違い/);
  for(let i=0;i<3;i++){button.onclick();assert.equal(panel.hidden,false);assert.equal(button.attrs['aria-expanded'],'true');button.onclick();assert.equal(panel.hidden,true);}
  assert.equal(node.children[0],primary);assert.equal(panel.children.length,group.ids.length+1);
 }
});
test('functional and form differences are not silently treated as equivalent',()=>{
 for(const id of ['switch-single','switch-wide','switch-H','switch-L','light-with-box','light-no-box','breaker-earth'])assert.equal(SYMBOL_VARIANTS[id],undefined,id);
 for(const [base,marker]of [['socket-E','E'],['socket-ET','ET'],['socket-EET','EET']]){
  const alt=SYMBOLS[SYMBOL_VARIANTS[base].ids[0]];assert.ok(alt.parts.some(([tag,,text])=>tag==='text'&&text===marker));
 }
});
test('question and learning-card loaders use the same fresh symbol module version',()=>{
 const read=p=>fs.readFileSync(new URL('../past-exams/'+p,import.meta.url),'utf8');
 assert.match(read('app.mjs'),/knowledge-router\.mjs\?v=1\.8\.6/);
 assert.match(read('knowledge-router.mjs'),/knowledge-beginner\.mjs\?v=1\.8\.6/);
 for(const file of ['app.mjs','knowledge-beginner.mjs'])assert.match(read(file),/inline-symbols\.mjs\?v=1\.8\.6/);
});
