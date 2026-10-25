// Lightweight DOM integration: use the real HTML and modules with synthetic browser storage.
// This never opens the public site or touches a user's browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STORAGE_KEY,validateHistory,questionStats,exportHistory} from '../past-exams/core.mjs';
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this._text='';this.value='';this.style={};this.listeners={};this.hidden=false;this.disabled=false;this.className='';this.classList={toggle:(key,on)=>{const parts=new Set(this.className.split(' ').filter(Boolean));on?parts.add(key):parts.delete(key);this.className=[...parts].join(' ');}};}
  set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
  get childNodes(){return this.children;}get isConnected(){return false;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);if(this.tag==='select'&&!this.children.slice(0,-1).length)this.value=n.value;}}
  replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);if(k==='value')this.value=String(v);if(k==='name')this.name=String(v);if(k==='class')this.className=String(v);if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  all(){return [this,...this.children.flatMap(n=>n.all())];}
  querySelectorAll(s){return this.all().filter(n=>{if(s.startsWith('#'))return n.id===s.slice(1);const m=s.match(/^([a-z-]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);if(m)return (!m[1]||n.tag===m[1])&&Object.hasOwn(n.attrs,m[2])&&(m[3]===undefined||n.attrs[m[2]]===m[3]);return n.tag===s;});}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  addEventListener(k,fn){this.listeners[k]=fn;}focus(){document.activeElement=this;}scrollIntoView(){}scrollTo(){}select(){}click(){this.onclick?.();}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}after(node){this.parentNode?.append(node);}closest(tag){let n=this;while(n&&n.tag!==tag)n=n.parentNode;return n;}showModal(){this.open=true;}close(){this.open=false;}
}
const root=new Element('document'),stack=[root];
const html=fs.readFileSync(new URL('../past-exams/index.html',import.meta.url),'utf8');
for(const token of html.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){
 const t=token[0];if(!t.startsWith('<')){stack.at(-1)._text+=t;continue;}
 const tag=t.match(/^<\/?([a-z][\w-]*)/i)?.[1];if(!tag)continue;
 if(t.startsWith('</')){while(stack.length>1&&stack.at(-1).tag!==tag)stack.pop();if(stack.length>1)stack.pop();continue;}
 const n=new Element(tag);for(const a of t.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(a[1],a[2]??'');
 stack.at(-1).append(n);if(!['meta','link','br','input','img','hr'].includes(tag))stack.push(n);
}
class Storage{m=new Map();get length(){return this.m.size;}key(i){return [...this.m.keys()][i];}getItem(k){return this.m.get(k)??null;}setItem(k,v){this.m.set(k,String(v));}removeItem(k){this.m.delete(k);}}
const storage=new Storage(),listeners={};
globalThis.document={createElement:t=>new Element(t),getElementById:id=>root.querySelector('#'+id),querySelectorAll:s=>root.querySelectorAll(s),body:root.querySelector('body')};
globalThis.window={localStorage:storage,scrollTo(){},addEventListener:(k,fn)=>listeners[k]=fn};globalThis.location={href:'https://isolated.test/past-exams/'};
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url),'utf8'));
globalThis.fetch=async path=>{assert.equal(path,'./data/exams.json');return {ok:true,json:async()=>structuredClone(data)};};
await import('../past-exams/app.mjs');for(let i=0;i<10&&!document.getElementById('start').onclick;i++)await new Promise(r=>setImmediate(r));
const $=id=>document.getElementById(id),click=id=>{assert.equal($(id).disabled,false,`${id} enabled`);$(id).onclick();};
const history=()=>validateHistory(JSON.parse(storage.getItem(STORAGE_KEY)));
const q=data.exams[0].questions[0];$('exam-filter').value=data.exams[0].id;
click('start');assert.equal($('question-title').textContent,'問 01');
assert.equal($('review-toggle').getAttribute('aria-pressed'),'false');click('review-toggle');
assert.equal(questionStats(history(),q.id).manualReview,true);assert.equal(questionStats(history(),q.id).attempts.length,0);
$('answer-choices').all().find(n=>n.tag==='input'&&n.value===q.answer).onchange();click('grade');
assert.equal(questionStats(history(),q.id).manualReview,true);assert.equal(questionStats(history(),q.id).cleanFirst,true);assert.equal(questionStats(history(),q.id).last.result,'correct');
const resultButton=()=>$('result').querySelector('[data-review-toggle]');assert.equal(resultButton().getAttribute('aria-pressed'),'true');resultButton().onclick();assert.equal(questionStats(history(),q.id).needsReview,false);assert.equal($('review-toggle').getAttribute('aria-pressed'),'false');
resultButton().onclick();assert.equal(questionStats(history(),q.id).manualReview,true);assert.equal($('review-toggle').getAttribute('aria-pressed'),'true');
$('mode-filter').value='retry';$('mode-filter').onchange();assert.equal($('filter-count').textContent,'1問');
assert.match($('result').textContent,/正解です/);assert.equal(questionStats(history(),q.id).attempts.length,1);
// Export/import shares the true/false event, deduplicates, and refreshes both answer-state controls.
const incoming=exportHistory(history(),data.dataVersion);const originalCount=incoming.events.length;const last=incoming.events.filter(e=>e.type==='review-flag').at(-1);incoming.events.push({...last,id:'imported-explicit-clear',occurredAt:new Date(Date.parse(last.occurredAt)+1000).toISOString(),reviewRequired:false});
$('import-file').files=[{size:1000,text:async()=>JSON.stringify(incoming)}];await $('import-file').onchange();
const mergeButton=$('import-preview').all().find(n=>n.tag==='button'&&n.textContent==='1件を統合する');assert(mergeButton);mergeButton.onclick();
assert.equal(history().events.length,originalCount+1);assert.equal(questionStats(history(),q.id).manualReview,false);assert.equal(resultButton().getAttribute('aria-pressed'),'false');assert.equal($('review-toggle').getAttribute('aria-pressed'),'false');
const nav=name=>document.querySelectorAll('[data-screen]').find(n=>n.dataset.screen===name).onclick();
nav('paper');const paper=$('paper-screen');const button=text=>paper.all().find(n=>n.tag==='button'&&n.textContent===text);button('新しく1回分をはじめる').onclick();
const fullToggle=()=>paper.querySelector('[data-paper-review]');assert(fullToggle());fullToggle().onclick();assert.equal(fullToggle().getAttribute('aria-pressed'),'true');
nav('learn');assert.equal($('review-toggle').getAttribute('aria-pressed'),'true');click('review-toggle');assert.equal(questionStats(history(),q.id).manualReview,false);
nav('paper');assert.equal(fullToggle().getAttribute('aria-pressed'),'false');fullToggle().onclick();
const answer=paper.all().find(n=>n.name==='paper-answer'&&n.value===q.answer);answer.onchange();button('解答を終えて、まとめて採点').onclick();button('確定して結果を見る').onclick();
button('問題・解説を見る').onclick();assert.equal(fullToggle().getAttribute('aria-pressed'),'true');fullToggle().onclick();assert.equal(fullToggle().getAttribute('aria-pressed'),'false');
assert.equal(questionStats(history(),q.id).manualReview,false);assert.equal(questionStats(history(),q.id).attempts.length,2);
nav('learn');assert.equal($('review-toggle').getAttribute('aria-pressed'),'false');
// Cross-tab storage changes refresh the current controls without touching the existing answer.
const disk=history(),flag=disk.events.filter(e=>e.type==='review-flag').at(-1);disk.events.push({...flag,id:'another-tab-flag',occurredAt:new Date(Date.parse(flag.occurredAt)+1000).toISOString(),reviewRequired:true});storage.setItem(STORAGE_KEY,JSON.stringify(disk));listeners.storage();
assert.equal(resultButton().getAttribute('aria-pressed'),'true');assert.equal(questionStats(history(),q.id).attempts.length,2);
// Explicit answer reveal and skip retain an enabled, synchronized toggle too.
click('start');click('reveal');assert.equal($('confirm-dialog').open,true);click('confirm-reveal');
assert.equal(resultButton().getAttribute('aria-pressed'),'true');resultButton().onclick();
assert.equal(questionStats(history(),q.id).manualReview,false);assert.equal(questionStats(history(),q.id).automaticReview,true);
$('mode-filter').value='all';$('mode-filter').onchange();click('start');click('skip');
assert.equal(resultButton().getAttribute('aria-pressed'),'false');resultButton().onclick();
assert.equal(questionStats(history(),q.id).manualReview,true);
assert($('result').all().some(n=>n.tag==='button'&&n.textContent==='この問題の正答・解説を見る'));
console.log('PASS real-app DOM: pre/post-answer flag, correct/first score unchanged, synced toggles, retry filter, JSON import, normal/full-paper shared state, pre/post-paper grading, cross-tab refresh');
// Share scope controls use actual app wiring and keep correct-but-uncertain notes.
const currentHistory=history(),template=currentHistory.events.find(e=>e.type==='attempt');
const noted={...template,id:'share-note-attempt',sessionId:'share-run',visitId:'share-visit',paperId:'share-run',practiceMode:'full-paper',selectedAnswer:template.officialCorrectAnswer,result:'correct',firstAttempt:false,firstEncounterUnaided:false,note:'正解したけれど、条件の意味が分からない',reviewRequiredAtSubmission:true,occurredAt:'2026-10-25T10:00:00.000Z',paperStartedAt:'2026-10-25T09:00:00.000Z',paperSubmittedAt:'2026-10-25T10:00:00.000Z'};
noted.occurredAt=new Date(Math.max(...currentHistory.events.map(e=>Date.parse(e.occurredAt)))+1000).toISOString();
currentHistory.events.push(noted);storage.setItem(STORAGE_KEY,JSON.stringify(currentHistory));listeners.storage();nav('share');
$('share-exam').value=q.examId;$('share-exam').onchange();assert($('share-run').all().some(n=>n.value==='share-run'));
$('share-run').value='share-run';$('share-run').onchange();$('share-notes-only').checked=true;$('share-notes-only').onchange();
assert($('summary-text').value.includes(noted.note));assert($('summary-text').value.includes('再挑戦'));assert($('summary-text').value.includes('対象の解答試行: 1件 / 正解 1'));
assert($('summary-text').value.includes('正解した問題も必ず読み'));assert.equal(history().events.length,currentHistory.events.length);
let savedBlob;URL.createObjectURL=blob=>{savedBlob=blob;return 'blob:test'};URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;
click('download-json');const subset=JSON.parse(await savedBlob.text());assert.equal(subset.events.length,1);assert.equal(subset.events[0].note,noted.note);assert(subset.attemptIndex[0].attemptNumber>1);
click('download-all-json');const allBackup=JSON.parse(await savedBlob.text());assert.equal(allBackup.events.length,currentHistory.events.length);assert(!allBackup.exportScope);
$('share-exam').value='';$('share-exam').onchange();assert.equal($('share-run').value,'');assert.equal($('share-notes-only').checked,true);
$('share-notes-only').checked=false;$('share-notes-only').onchange();assert($('summary-text').value.includes('解答記録（全試行）'));
console.log('PASS real-app share: exam/run/notes-only selection, correct uncertain note text, selected importable JSON, complete backup, non-destructive filtering');
