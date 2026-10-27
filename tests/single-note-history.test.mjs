import test from 'node:test';
import assert from 'node:assert/strict';
import {freshHistory,HistoryStore,makeEvent,makeAttempt,saveQuestionNote,latestQuestionNotes,exportHistory,summaryText,validateHistory,questionStats,conditions,previewMerge,STORAGE_KEY} from '../past-exams/core.mjs';
class Storage{m=new Map();getItem(k){return this.m.get(k)??null}setItem(k,v){this.m.set(k,v)}removeItem(k){this.m.delete(k)}}
const q={id:'d2-20250525-01',examId:'d2-20250525',number:1,topic:'theory',examTitle:'令和7年度上期',answer:'イ'},q2={...q,id:'d2-20250525-02',number:2};
const ctx=(visitId='v1')=>({visitId,sessionId:'s1',dataVersion:'test-data'});
function setup(){const storage=new Storage(),store=new HistoryStore(storage,[q,q2]);return {storage,store};}
test('question notes save unanswered, restore, clear, Unicode limit and no phantom attempts',()=>{
 const {storage,store}=setup(),c=ctx();store.append(makeEvent('view',q,c));const before=conditions(store.history,q.id,c.visitId);
 const e=saveQuestionNote(store,q,c,'😀'.repeat(200),{phase:'before-answer'});assert.equal(e.notePhase,'before-answer');assert.equal(questionStats(store.history,q.id).attempts.length,0);assert.deepEqual(conditions(store.history,q.id,c.visitId),before);
 assert.throws(()=>saveQuestionNote(store,q,c,'😀'.repeat(201),{phase:'before-answer'}));const restored=new HistoryStore(storage,[q,q2]);assert.equal(latestQuestionNotes(restored.history,q.id)[0].note,e.note);
 saveQuestionNote(store,q,c,'',{phase:'before-answer'});assert.equal(latestQuestionNotes(store.history,q.id).length,1);assert.equal(latestQuestionNotes(store.history,q.id)[0].note,'');assert.equal(exportHistory(store.history,'test-data',[q,q2],{notesOnly:true}).events.length,0);
});
test('pre snapshot immutable; post note includes linked attempt, not other retries, in AI export',()=>{
 const {store}=setup(),c=ctx();store.append(makeEvent('view',q,c));saveQuestionNote(store,q,c,'なぜ？',{phase:'before-answer'});
 const a=makeAttempt(store.history,q,c,'イ');a.note='なぜ？';store.append(a);const orig=JSON.stringify(a);
 const c2=ctx('v2');store.append(makeEvent('view',q,c2));const a2=makeAttempt(store.history,q,c2,'ロ');store.append(a2);
 saveQuestionNote(store,q,c2,'解説を読んだ後の疑問',{phase:'after-answer',relatedAttemptId:a2.id});assert.equal(JSON.stringify(a),orig);assert.equal(questionStats(store.history,q.id).attempts.length,2);
 const c3=ctx('v3');store.append(makeEvent('view',q,c3));const a3=makeAttempt(store.history,q,c3,'イ');store.append(a3);
 const out=exportHistory(store.history,'test-data',[q,q2],{examId:q.examId,notesOnly:true});assert.deepEqual(out.events.filter(e=>e.type==='attempt').map(e=>e.id),[a.id,a2.id]);assert(!out.events.some(e=>e.id===a3.id));
 const txt=summaryText(store.history,[q,q2],'test-data',{notesOnly:true});assert(txt.includes('採点後メモ'));assert(txt.includes('解説を読んだ後の疑問'));assert(txt.includes('令和7年度上期 問1'));assert(txt.includes('解答時メモ: "なぜ？"'));assert.equal(validateHistory(out).events.length,out.events.length);
});
test('unanswered notes-only is exportable with no official answer; text uses latest not every keystroke',()=>{
 const {store}=setup(),c=ctx();store.append(makeEvent('view',q,c));saveQuestionNote(store,q,c,'古い疑問',{phase:'before-answer'});saveQuestionNote(store,q,c,'新しい疑問',{phase:'before-answer'});
 const out=exportHistory(store.history,'test-data',[q],{notesOnly:true});assert.equal(out.selectionSummary.attempts,0);assert.equal(out.events.filter(e=>e.type==='question-note').length,1);assert(!JSON.stringify(out.events).includes('officialCorrectAnswer'));
 for(const scope of [{},{notesOnly:true}]){const txt=summaryText(store.history,[q],'test-data',scope);assert(txt.includes('新しい疑問'));assert(!txt.includes('古い疑問'));}
 const full=exportHistory(store.history,'test-data',[q]);assert.equal(full.events.filter(e=>e.type==='question-note').length,2);assert.equal(previewMerge(store.history,validateHistory(full)).added,0);
});
test('notes cannot change review flags, inject scores or cross-link another question; partial note backup valid',()=>{
 const {store}=setup(),c=ctx();const a=makeAttempt(store.history,q,c,'イ');store.append(a);
 const n=saveQuestionNote(store,q,c,'疑問',{phase:'after-answer',relatedAttemptId:a.id});
 for(const patch of [{notePhase:'bad'},{note:3},{note:'x'.repeat(201)},{relatedAttemptId:''},{reviewRequired:true},{officialCorrectAnswer:'イ'},{paperId:'p'}])assert.throws(()=>validateHistory({...freshHistory(),events:[{...n,...patch}]}));
 assert.throws(()=>saveQuestionNote(store,q2,c,'違う問題',{phase:'after-answer',relatedAttemptId:a.id}));
 assert.throws(()=>validateHistory({...freshHistory(),events:[a,{...n,questionId:q2.id,number:2}]}));
 assert.equal(validateHistory({...freshHistory(),events:[n]}).events.length,1);
});
test('clear survives newer clock imports and concurrent store append preserves other notes and attempts',()=>{
 const {store,storage}=setup(),c=ctx(),other=new HistoryStore(storage,[q,q2]);let e=saveQuestionNote(store,q,c,'元',{phase:'before-answer'});const future={...e,id:'future',occurredAt:'2099-01-01T00:00:00.000Z',note:'未来'};store.append(future);
 const a=makeAttempt(other.history,q2,ctx('other'),'イ');other.append(a);saveQuestionNote(store,q,c,'',{phase:'before-answer'});
 assert.equal(latestQuestionNotes(store.history,q.id)[0].note,'');assert(store.history.events.some(e=>e.id===a.id));assert.equal(new HistoryStore(storage,[q,q2]).history.events.length,store.history.events.length);
 assert(storage.getItem(STORAGE_KEY));
});
