// Lightweight DOM integration: use the real HTML and modules with synthetic browser storage.
// This never opens the public site or touches a user's browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STORAGE_KEY,validateHistory,questionStats,exportHistory,latestQuestionNotes,summaryText,HistoryStore,previewMerge} from '../past-exams/core.mjs';
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
const storage=new Storage(),listeners={},documentListeners={};
globalThis.document={visibilityState:'visible',addEventListener:(k,fn)=>documentListeners[k]=fn,createElement:t=>new Element(t),getElementById:id=>root.querySelector('#'+id),querySelectorAll:s=>root.querySelectorAll(s),body:root.querySelector('body')};
globalThis.window={localStorage:storage,scrollTo(){},addEventListener:(k,fn)=>listeners[k]=fn};globalThis.location={href:'https://isolated.test/past-exams/'};
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url),'utf8'));
globalThis.fetch=async path=>{assert.equal(path,'./data/exams.json');return {ok:true,json:async()=>structuredClone(data)};};
await import('../past-exams/app.mjs');for(let i=0;i<10&&!document.getElementById('start').onclick;i++)await new Promise(r=>setImmediate(r));
const $=id=>document.getElementById(id),click=id=>{assert.equal($(id).disabled,false,`${id} enabled`);$(id).onclick();};
const history=()=>validateHistory(JSON.parse(storage.getItem(STORAGE_KEY)));
const q=data.exams[0].questions[0],q2=data.exams[0].questions[1];$('exam-filter').value=data.exams[0].id;
const nav=name=>document.querySelectorAll('[data-screen]').find(n=>n.dataset.screen===name).onclick();
const attempts=()=>history().events.filter(e=>e.type==='attempt');
const notes=id=>latestQuestionNotes(history(),id);
const write=(id,value,flush=true)=>{const n=$(id);assert(n,`missing ${id}`);n.value=value;n.oninput();if(flush)n.onchange();return n;};
click('start');let before=$('single-note-before');assert(before);assert.equal(before.value,'');
before.oncompositionstart();before.value='日本語の変換中';before.oninput();assert.equal(notes(q.id).length,0);before.oncompositionend();assert.equal(notes(q.id).at(-1).note,'日本語の変換中');
write('single-note-before','😀'.repeat(201));assert.equal([...before.value].length,200);assert.equal([...notes(q.id).at(-1).note].length,200);
const draft='未採点の疑問 <img src=x onerror=alert(1)>';write('single-note-before',draft,false);nav('share');assert.equal(attempts().length,0);assert.equal(notes(q.id).at(-1).note,draft);assert($('summary-text').value.includes(draft));
$('share-notes-only').checked=true;$('share-notes-only').onchange();assert($('summary-text').value.includes(draft));let subset=exportHistory(history(),data.dataVersion,null,{notesOnly:true});assert.equal(subset.selectionSummary.attempts,0);assert(subset.events.some(e=>e.type==='question-note'&&e.note===draft));
nav('learn');click('stop-session');click('start');assert.equal($('single-note-before').value,draft);assert.equal(attempts().length,0);
// Editing a restored draft does not corrupt the historical answer (there is none yet).
const pre='条件Aと条件Bのどちらか不明';write('single-note-before',pre,false);
$('answer-choices').all().find(n=>n.tag==='input'&&n.value===q.answer).onchange();click('grade');
const answer=attempts().at(-1),answerSnapshot=JSON.stringify(answer);assert.equal(answer.note,pre);assert.equal(answer.result,'correct');assert.equal($('single-note-before').readOnly,true);assert($('single-note-after'));
const post='正解だが理由がまだ不明 <svg onload=alert(1)>';write('single-note-after',post,false);nav('share');
assert.equal(JSON.stringify(attempts().at(-1)),answerSnapshot);assert.equal(notes(q.id).find(e=>e.notePhase==='after-answer').note,post);assert($('summary-text').value.includes(post));assert($('summary-text').value.includes('採点後メモ'));
subset=exportHistory(history(),data.dataVersion,null,{notesOnly:true});assert.equal(subset.selectionSummary.attempts,1);assert(subset.events.some(e=>e.type==='question-note'&&e.relatedAttemptId===answer.id));assert.doesNotThrow(()=>validateHistory(subset));
nav('learn');write('single-note-after','');nav('share');assert(!$('summary-text').value.includes(post));assert.equal(JSON.stringify(attempts().at(-1)),answerSnapshot);assert.equal(notes(q.id).find(e=>e.notePhase==='after-answer').note,'');
// A scored restored draft must not resurrect the old ungraded source on the next visit.
nav('learn');click('stop-session');click('start');assert.equal($('single-note-before').value,'','graded restored draft must not resurrect');
assert.equal($('single-notes').querySelectorAll('img').length,0);assert.equal($('single-notes').querySelectorAll('svg').length,0);assert($('single-notes').textContent.includes(pre));
// Navigation before debounce saves another question without adding a phantom attempt.
const q2Button=$('question-list').all().find(n=>n.tag==='button'&&n.getAttribute('aria-label')?.includes('問2、'));assert(q2Button);q2Button.onclick();write('single-note-before','未採点の別問題メモ',false);listeners.pagehide();assert.equal(attempts().length,1);assert.equal(notes(q2.id).at(-1).note,'未採点の別問題メモ');
let reloaded=new HistoryStore(storage);assert.equal(latestQuestionNotes(reloaded.history,q2.id).at(-1).note,'未採点の別問題メモ');assert.equal(questionStats(reloaded.history,q2.id).attempts.length,0);
// Restore then clear uses the original draft identity, so it cannot resurface later.
click('stop-session');$('question-list').all().find(n=>n.tag==='button'&&n.getAttribute('aria-label')?.includes('問2、')).onclick();assert.equal($('single-note-before').value,'未採点の別問題メモ');
// Current-visit clear removes only the live memo from AI text, original journal remains losslessly exportable.
write('single-note-before','');nav('share');assert(!$('summary-text').value.includes('未採点の別問題メモ'));const full=exportHistory(history(),data.dataVersion);assert(full.events.some(e=>e.note==='未採点の別問題メモ'));assert.equal(previewMerge(history(),full).added,0);
nav('learn');click('stop-session');$('question-list').all().find(n=>n.tag==='button'&&n.getAttribute('aria-label')?.includes('問2、')).onclick();assert.equal($('single-note-before').value,'','cleared restored draft remains cleared');write('single-note-before','visibility flush',false);document.visibilityState='hidden';documentListeners.visibilitychange();assert.equal(notes(q2.id).at(-1).note,'visibility flush');write('single-note-before','');
console.log('PASS single notes real-app DOM: IME, Unicode limit, pre-grade draft persistence and restoration, immutable answer snapshot, post-grade note, notes-only unanswered/export, clear, safe text, navigation/pagehide and reload');
