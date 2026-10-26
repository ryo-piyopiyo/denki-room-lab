import assert from 'node:assert/strict';import fs from 'node:fs';
import {mountFullPaper,PAPER_PREFIX,examAnswerStatus,createPaperRun} from '../past-exams/full-paper.mjs';import {HistoryStore,questionStats,makeAttempt,makeEvent,freshHistory} from '../past-exams/core.mjs';
class Node{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this._text='';this.value='';}set textContent(t){this._text=String(t);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join(' ')}append(...nodes){for(const n of nodes){this.children.push(n);if(this.tag==='select'&&!this.value)this.value=n.value;}}replaceChildren(...n){this._text='';this.children=[];this.append(...n)}setAttribute(k,v){this.attrs[k]=v}focus(){}scrollIntoView(){}getAttribute(k){return this.attrs[k]}querySelectorAll(s){return this.all().filter(n=>s.startsWith('[')?Object.hasOwn(n.attrs,s.slice(1,-1)):s.startsWith('#')?n.id===s.slice(1):n.tag===s)}querySelector(s){return this.querySelectorAll(s)[0]}all(){return [this,...this.children.flatMap(n=>n.all?.()||[])]}}
globalThis.document={createElement:t=>new Node(t)};
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url)));const questions=data.exams.flatMap(e=>e.questions.map(q=>({...q,examId:e.id,year:e.year,contexts:e.contexts})));
class Storage{m=new Map();get length(){return this.m.size}key(i){return [...this.m.keys()][i]}getItem(k){return this.m.get(k)??null}setItem(k,v){this.m.set(k,v)}removeItem(k){this.m.delete(k)}}
const storage=new Storage(),store=new HistoryStore(storage,questions),root=new Node('section');let explains=0;
const props={root,data,questions,store,storage,imageButton:()=>new Node('img'),explanation:()=>{explains++;return new Node('aside')},knowledge:()=>new Node('aside'),onHistory:()=>{}};
let app=mountFullPaper(props);const nodes=()=>root.all();const click=text=>{const n=nodes().find(n=>n.tag==='button'&&n.textContent===text);assert(n,`missing ${text}`);assert(!n.disabled);n.onclick()};const choose=c=>{const n=nodes().find(n=>n.name==='paper-answer'&&n.value===c);assert(n);n.onchange()};const attemptCount=()=>store.history.events.filter(e=>e.type==='attempt').length;


const first=data.exams[0],qs=questions.filter(q=>q.examId===first.id),ctx={visitId:'v',sessionId:'s',dataVersion:data.dataVersion};
const label=()=>nodes().find(n=>n.id==='paper-exam').children.find(n=>n.value===first.id).textContent;
app.render();assert.match(label(),/^未着手/);
store.append(makeEvent('view',qs[0],ctx));store.append(makeAttempt(store.history,qs[1],ctx,null));app.render();assert.match(label(),/^未着手/);
store.append(makeAttempt(store.history,qs[0],ctx,'イ'));store.append(makeAttempt(store.history,qs[0],ctx,'ロ'));app.render();assert.match(label(),/^解答済み 1\/50問/);
const draft=createPaperRun(first,qs,data.dataVersion);draft.answers={[qs[0].id]:'イ',[qs[2].id]:'ロ'};storage.setItem(PAPER_PREFIX+draft.id,JSON.stringify(draft));app.render();assert.match(label(),/^解答済み 2\/50問 · 途中保存あり/);
assert.match(nodes().find(n=>n.id==='paper-exam').attrs['aria-describedby'],/paper-setup-progress/);
const before=JSON.stringify(store.history);app.render();assert.equal(JSON.stringify(store.history),before);
click('新しく1回分をはじめる');choose('イ');assert.match(label(),/^解答済み 2\/50問/);click('次の問題 →');choose('ロ');assert.match(label(),/^解答済み 3\/50問/);
click('この解答を取り消す');assert.match(label(),/^解答済み 2\/50問/);
const fake=[{id:'a'},{id:'b',excluded:true}];assert.deepEqual(examAnswerStatus(fake,{events:[{type:'attempt',questionId:'a',selectedAnswer:null},{type:'view',questionId:'a'},{type:'attempt',questionId:'b',selectedAnswer:'イ'}]},[{answers:{a:'ロ',b:'ハ'}},{answers:{a:'イ'}}]),{answered:1,eligible:1});
storage.setItem(PAPER_PREFIX+'corrupt','bad');app.render();assert.match(label(),/確認できた記録のみ/);
console.log('PASS selector unique history + draft union, views/skips excluded, live answer/cancel refresh, accessible labels, no mutations, corrupt storage');
