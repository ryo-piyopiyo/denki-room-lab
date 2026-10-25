import test from 'node:test';
import assert from 'node:assert/strict';
import {freshHistory,makeAttempt,makeEvent,validateHistory,previewMerge,exportHistory,summaryText,historyPaperRuns,exportScope} from '../past-exams/core.mjs';
const q={id:'d2-20200101-01',examId:'d2-20200101',number:1,topic:'test',answer:'イ',examTitle:'2020年の試験'};
const q2={...q,id:'d2-20210101-01',examId:'d2-20210101',examTitle:'2021年の試験'};
const ctx=id=>({visitId:id,sessionId:id,dataVersion:'v1'});
function fixture(){
 const h=freshHistory();
 h.events.push({...makeAttempt(h,q,ctx('run1'),'ロ'),paperId:'run1',note:'知らない単位を確認したい',reviewRequiredAtSubmission:true,paperStartedAt:'2026-10-25T00:00:00Z',paperSubmittedAt:'2026-10-25T01:00:00Z'});
 h.events.push(makeEvent('review-flag',q,ctx('run1'),{reviewRequired:true}));
 h.events.push({...makeAttempt(h,q,ctx('run2'),'イ'),paperId:'run2',note:'偶然正解したがロと迷った。\n何が違う？',reviewRequiredAtSubmission:true,paperStartedAt:'2026-10-25T02:00:00Z',paperSubmittedAt:'2026-10-25T03:00:00Z'});
 h.events.push(makeEvent('view',q,ctx('run2')));
 h.events.push({...makeAttempt(h,q2,ctx('run3'),'イ'),paperId:'run3',note:'',reviewRequiredAtSubmission:false});
 return h;
}
test('paper-only extraction excludes other sittings and retains global retry index',()=>{
 const h=fixture(), out=exportHistory(h,'v1',[q,q2],{examId:q.examId,paperId:'run2'});
 assert.equal(out.events.length,2);assert(out.events.every(e=>e.sessionId==='run2'));
 assert.equal(out.attemptIndex[0].attemptNumber,2);assert.equal(out.attemptIndex[0].cleanFirstEncounter,false);
 assert.equal(out.selectionSummary.correct,1);assert.equal(out.selectionSummary.retryAttempts,1);
 assert.equal(validateHistory(out,[q,q2]).events.length,2);
 assert.equal(previewMerge(h,out).added,0);
 assert.equal(out.events[0].note,'偶然正解したがロと迷った。\n何が違う？');
 const text=summaryText(h,[q,q2],'v1',{examId:q.examId,paperId:'run2'});
 assert(text.includes('全履歴の第2試行（再挑戦）'));assert(text.includes('偶然正解'));assert(text.includes('採点時の要復習: あり'));assert(text.includes('正解した問題も必ず読み'));
 assert(!text.includes('知らない単位'));assert(!text.includes(q2.id));
});
test('exam extraction includes all attempts of that exam only',()=>{
 const out=exportHistory(fixture(),'v1',[q,q2],{examId:q.examId});
 assert.equal(out.attemptIndex.length,2);assert.deepEqual(out.attemptIndex.map(a=>a.attemptNumber),[1,2]);assert(out.events.every(e=>e.examId===q.examId));
});
test('notes-only extraction includes correct uncertain answer and related events, omits empty notes',()=>{
 const h=fixture(),out=exportHistory(h,'v1',[q,q2],{notesOnly:true});
 assert.equal(out.selectionSummary.attempts,2);assert.equal(out.selectionSummary.correct,1);assert.equal(out.events.length,4);
 assert(!out.events.some(e=>e.examId===q2.examId));assert(out.exportScope.notesOnly);
 assert.equal(exportScope(h,{paperId:'run3',notesOnly:true}).events.length,0);
 assert(summaryText(h,[q,q2],'v1',{notesOnly:true}).includes('正解・不正解を問わず'));
});
test('no scope remains full history and includes notes in ordinary text',()=>{
 const h=fixture(),out=exportHistory(h,'v1',[q,q2]);assert.equal(out.events.length,h.events.length);assert(out.summary);assert(!out.exportScope);
 assert(summaryText(h,[q,q2],'v1').includes('偶然正解'));assert(summaryText(h,[q,q2],'v1').includes('正解した問題のメモも必ず読み'));
});
test('run chooser supports old events lacking new metadata, lists repeated sittings separately',()=>{
 const h=fixture(),runs=historyPaperRuns(h,q.examId);assert.equal(runs.length,2);assert.equal(runs[0].paperId,'run2');assert.equal(runs[1].correct,0);
 assert.equal(historyPaperRuns(h).length,3);
});
test('new optional fields validate without breaking old records, bound notes by Unicode codepoints',()=>{
 const h=fixture();assert.doesNotThrow(()=>validateHistory(h,[q,q2]));
 h.events[0].note='🐥'.repeat(200);assert.doesNotThrow(()=>validateHistory(h));
 h.events[0].note+='🐥';assert.throws(()=>validateHistory(h),/200字/);
 h.events[0].note=3;assert.throws(()=>validateHistory(h),/200字/);
 delete h.events[0].note;h.events[0].reviewRequiredAtSubmission='true';assert.throws(()=>validateHistory(h),/採点時/);
 delete h.events[0].reviewRequiredAtSubmission;delete h.events[0].paperStartedAt;delete h.events[0].paperSubmittedAt;assert.doesNotThrow(()=>validateHistory(h));
 h.events[0].paperStartedAt='not-a-date';assert.throws(()=>validateHistory(h),/日時/);
});
