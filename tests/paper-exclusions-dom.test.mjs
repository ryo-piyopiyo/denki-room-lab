import assert from 'node:assert/strict';import fs from 'node:fs';
import {mountFullPaper,PAPER_PREFIX,exclusionSummary} from '../past-exams/full-paper.mjs';import {HistoryStore,questionStats} from '../past-exams/core.mjs';
class Node{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this._text='';this.value='';}set textContent(t){this._text=String(t);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join(' ')}append(...nodes){for(const n of nodes){this.children.push(n);if(this.tag==='select'&&!this.value)this.value=n.value;}}replaceChildren(...n){this._text='';this.children=[];this.append(...n)}setAttribute(k,v){this.attrs[k]=v}focus(){}scrollIntoView(){}getAttribute(k){return this.attrs[k]}querySelectorAll(s){return this.all().filter(n=>s.startsWith('[')?Object.hasOwn(n.attrs,s.slice(1,-1)):s.startsWith('#')?n.id===s.slice(1):n.tag===s)}querySelector(s){return this.querySelectorAll(s)[0]}all(){return [this,...this.children.flatMap(n=>n.all?.()||[])]}}
globalThis.document={createElement:t=>new Node(t)};
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url)));const questions=data.exams.flatMap(e=>e.questions.map(q=>({...q,examId:e.id,year:e.year,contexts:e.contexts})));
class Storage{m=new Map();get length(){return this.m.size}key(i){return [...this.m.keys()][i]}getItem(k){return this.m.get(k)??null}setItem(k,v){this.m.set(k,v)}removeItem(k){this.m.delete(k)}}
const storage=new Storage(),store=new HistoryStore(storage,questions),root=new Node('section');let explains=0;
const props={root,data,questions,store,storage,imageButton:()=>new Node('img'),explanation:()=>{explains++;return new Node('aside')},knowledge:()=>new Node('aside'),onHistory:()=>{}};
let app=mountFullPaper(props);const nodes=()=>root.all();const click=text=>{const n=nodes().find(n=>n.tag==='button'&&n.textContent===text);assert(n,`missing ${text}`);assert(!n.disabled);n.onclick()};const choose=c=>{const n=nodes().find(n=>n.name==='paper-answer'&&n.value===c);assert(n);n.onchange()};const attemptCount=()=>store.history.events.filter(e=>e.type==='attempt').length;

app.render();
const select=()=>nodes().find(n=>n.id==='paper-exam');
const setup=()=>nodes().find(n=>n.id==='paper-setup-exclusions');
assert.match(setup().textContent,/採点対象外：なし/);
const withExcluded=data.exams.find(e=>e.questions.some(q=>q.excluded));
const excluded=withExcluded.questions.filter(q=>q.excluded);
select().value=withExcluded.id;select().onchange();
for(const q of excluded)assert(setup().textContent.includes(`問${q.number}`));
assert.equal(store.history.events.length,0);
click('新しく1回分をはじめる');
for(const q of excluded){const b=nodes().find(n=>n.attrs['data-paper-number']===q.id);assert(b.textContent.includes('対象外'));assert(b.attrs['aria-label'].includes('採点対象外'));assert(!b.textContent.includes('―'));}
assert(root.textContent.includes(exclusionSummary(withExcluded.questions)));
const target=excluded[0];nodes().find(n=>n.attrs['data-paper-number']===target.id).onclick();
assert(!nodes().some(n=>n.name==='paper-answer'));
assert.equal(store.history.events.filter(e=>e.type==='attempt').length,0);
const history=JSON.stringify(store.history);
app=mountFullPaper(props);app.render();nodes().find(n=>n.tag==='button'&&n.textContent.includes('· 途中 ·')).onclick();
assert.equal(JSON.stringify(store.history),history);
assert(root.textContent.includes(exclusionSummary(withExcluded.questions)));
click('解答を終えて、まとめて採点');click('確定して結果を見る');
assert.equal(store.history.events.filter(e=>e.type==='attempt').length,50-excluded.length);
assert(!store.history.events.some(e=>excluded.some(q=>q.id===e.questionId)));
select().value=data.exams.find(e=>!e.questions.some(q=>q.excluded)).id;select().onchange();assert.match(setup().textContent,/採点対象外：なし/);
console.log('PASS exclusion upfront, exam change, no history side effect, navigator labels, resume, no answer/grading for exclusions, no-exclusion case');
