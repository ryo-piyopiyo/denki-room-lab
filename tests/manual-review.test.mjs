import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION, SCHEMA_VERSION, STORAGE_KEY, LEGACY_KEY, HistoryStore,
  freshHistory, makeEvent, makeAttempt, conditions, questionStats,
  summarize, filteredQuestions, exportHistory, validateHistory, previewMerge,
  summaryText, ordered,
} from '../past-exams/core.mjs';
import {createPaperRun, legacyPaperReviewEvents} from '../past-exams/full-paper.mjs';

const q = {id:'d2-20260524-01',examId:'d2-20260524',number:1,topic:'tools',topicLabel:'工具',answer:'イ',year:2026,lawAudit:{status:'not_rule_dependent'}};
const other = {...q,id:'d2-20260524-02',number:2};
const excluded = {...q,id:'d2-20260524-03',number:3,excluded:true};
const questions = [q,other,excluded];
const ctx = {visitId:'visit-1',sessionId:'session-1',dataVersion:'test-v1'};
class Storage {
  map = new Map();
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key,value) { this.map.set(key,String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const setup = () => { const storage=new Storage();return {storage,store:new HistoryStore(storage,questions)}; };
const withEvents = (...events) => ({...freshHistory(),events});
let serial=0;
function flag(reviewRequired,occurredAt='2026-10-20T00:00:00.000Z',extra={}) {
  return {...makeEvent('review-flag',q,ctx,{reviewRequired}),id:`fixture-flag-${++serial}`,occurredAt,...extra};
}
function legacyRun() {
  const run=createPaperRun({id:q.examId},questions,ctx.dataVersion);
  run.id='legacy-run-1';run.startedAt='2026-10-19T08:00:00Z';
  run.flags[`${q.id}:review`]=true;
  run.flags[`${other.id}:review`]=false;
  return run;
}

test('manual flag works before an answer without counting as exposure, help, or attempt',()=>{
  const {store}=setup();
  const before=conditions(store.history,q.id,ctx.visitId);
  assert.equal(store.toggleReview(q,ctx),true);
  assert.deepEqual(conditions(store.history,q.id,ctx.visitId),before);
  const s=questionStats(store.history,q.id);
  assert.equal(s.manualReview,true);assert.equal(s.needsReview,true);
  assert.equal(s.seen,false);assert.equal(s.answered,false);assert.equal(s.attempts.length,0);
  assert.equal(s.previousHelp,false);assert.equal(s.previousReveal,false);
  assert.equal(store.history.events[0].type,'review-flag');
  assert.equal('officialCorrectAnswer' in store.history.events[0],false);
  assert.equal('selectedAnswer' in store.history.events[0],false);
});

test('correct answer and reveal retain manual flag; clearing preserves clean first score',()=>{
  const {store,storage}=setup();store.append(makeEvent('view',q,ctx));
  store.toggleReview(q,ctx);
  store.append(makeAttempt(store.history,q,ctx,q.answer));
  store.append(makeEvent('reveal',q,ctx));
  let s=questionStats(store.history,q.id);
  assert.equal(s.cleanFirst,true);assert.equal(s.last.result,'correct');
  assert.equal(s.automaticReview,false);assert.equal(s.manualReview,true);assert.equal(s.needsReview,true);
  const reloaded=new HistoryStore(storage,questions);
  assert.equal(questionStats(reloaded.history,q.id).manualReview,true);
  reloaded.toggleReview(q,ctx);s=questionStats(reloaded.history,q.id);
  assert.equal(s.manualReview,false);assert.equal(s.needsReview,false);assert.equal(s.cleanFirst,true);
  assert.equal(s.attempts.length,1);assert.equal(s.previousReveal,true);
  reloaded.toggleReview(q,ctx);
  assert.equal(questionStats(reloaded.history,q.id).manualReview,true);
  assert.deepEqual(summarize(reloaded.history,questions).cleanCorrect,1);
});

test('manual clear does not erase wrong, skip, help, reveal, or prior-exposure review reasons',()=>{
  for(const reason of ['incorrect','skip','help','reveal','prior-exposure']) {
    const {store}=setup();store.append(makeEvent('view',q,ctx));
    if(['help','reveal','prior-exposure'].includes(reason))store.append(makeEvent(reason,q,ctx));
    store.append(makeAttempt(store.history,q,ctx,reason==='skip'?null:reason==='incorrect'?'ロ':q.answer));
    store.toggleReview(q,ctx);store.toggleReview(q,ctx);
    const s=questionStats(store.history,q.id);
    assert.equal(s.manualReview,false,reason);assert.equal(s.automaticReview,true,reason);assert.equal(s.needsReview,true,reason);
  }
});

test('later clean retry removes only the automatic reason, not the manual flag',()=>{
  const {store}=setup();store.append(makeEvent('view',q,ctx));
  store.append(makeAttempt(store.history,q,ctx,'ロ'));store.toggleReview(q,ctx);
  const retry={...ctx,visitId:'visit-2'};store.append(makeEvent('view',q,retry));
  store.append(makeAttempt(store.history,q,retry,q.answer));
  const s=questionStats(store.history,q.id);
  assert.equal(s.automaticReview,false);assert.equal(s.manualReview,true);assert.equal(s.needsReview,true);
  assert.equal(s.first.result,'incorrect');assert.equal(s.attempts.length,2);
});

test('retry filter and counts include unanswered manual flags and respect exclusions',()=>{
  const {store}=setup();store.toggleReview(q,ctx);store.toggleReview(excluded,ctx);
  const filters={validity:'current',mode:'retry'};
  assert.deepEqual(filteredQuestions(questions,store.history,filters).map(q=>q.id),[q.id]);
  assert.deepEqual(filteredQuestions(questions,store.history,{...filters,validity:'all'}).map(q=>q.id),[q.id,excluded.id]);
  assert.deepEqual(filteredQuestions(questions,store.history,{...filters,validity:'historical'}).map(q=>q.id),[excluded.id]);
  const s=summarize(store.history,questions);
  assert.equal(s.needsReview,1);assert.equal(s.manualReview,2);assert.equal(s.topics.tools.needsReview,1);
  assert.equal(s.answered,0);assert.equal(s.attempts,0);
});

test('schemas 1 and 2 migrate without losing events and retain exact raw backups',()=>{
  assert.equal(SCHEMA_VERSION,3);assert.equal(STORAGE_KEY,'denki.official-pastpapers.history.v2');
  for(const [version,key] of [[1,LEGACY_KEY],[1,STORAGE_KEY],[2,STORAGE_KEY]]) {
    const storage=new Storage();
    const prior={...freshHistory(),schemaVersion:version,appVersion:'1.6.1',events:[makeEvent('view',q,ctx)]};
    const raw=JSON.stringify(prior);storage.setItem(key,raw);
    const store=new HistoryStore(storage,questions);
    assert.equal(store.status,'ok');assert.equal(store.history.schemaVersion,3);
    assert.deepEqual(store.history.events,prior.events);assert.equal(store.history.migratedFrom,version);
    assert.equal(storage.getItem(`${key}.pre-migration`),raw);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion,3);
    store.toggleReview(q,ctx);
    assert.equal(new HistoryStore(storage,questions).history.events.length,2);
    assert.equal(storage.getItem(`${key}.pre-migration`),raw);
  }
});

test('migration preserves an existing different backup and prioritizes current-key history',()=>{
  const storage=new Storage();const prior={...freshHistory(),schemaVersion:2,events:[makeEvent('view',q,ctx)]};
  const raw=JSON.stringify(prior);storage.setItem(STORAGE_KEY,raw);
  storage.setItem(`${STORAGE_KEY}.pre-migration`,'older-protected-data');
  const oldLegacy=JSON.stringify({...freshHistory(),schemaVersion:1,events:[makeEvent('help',other,ctx)]});
  storage.setItem(LEGACY_KEY,oldLegacy);
  const store=new HistoryStore(storage,questions);
  assert.equal(store.status,'ok');assert.deepEqual(store.history.events,prior.events);
  assert.equal(storage.getItem(`${STORAGE_KEY}.pre-migration`),'older-protected-data');
  assert.equal(storage.getItem(LEGACY_KEY),oldLegacy);
  assert.ok([...storage.map.entries()].some(([key,value])=>key.startsWith(`${STORAGE_KEY}.pre-migration.`)&&value===raw));
});

test('export/import/merge preserve flags and clears, deduplicate, and retain unavailable events',()=>{
  const {store}=setup();store.append(makeEvent('view',q,ctx));store.toggleReview(q,ctx);
  const older=exportHistory(store.history,ctx.dataVersion,questions);
  store.append(makeAttempt(store.history,q,ctx,q.answer));store.toggleReview(q,ctx);
  const missing={...q,id:'d2-20251026-01',examId:'d2-20251026'};
  store.toggleReview(missing,ctx);
  const exported=exportHistory(store.history,ctx.dataVersion,questions);
  const imported=validateHistory(JSON.parse(JSON.stringify(exported)),questions);
  assert.equal(imported.events.length,store.history.events.length);
  assert.equal(questionStats(imported,q.id).manualReview,false);
  assert.equal(questionStats(imported,missing.id).manualReview,true);
  assert.equal(exported.attemptIndex.length,1);assert.equal(exported.summary.unavailableEvents,1);
  assert.equal(previewMerge(imported,exported).added,0);
  const merged=previewMerge(imported,older).history;
  assert.equal(questionStats(merged,q.id).manualReview,false);
  assert.deepEqual(merged.events,imported.events);
  const text=summaryText(merged,questions,ctx.dataVersion);
  assert.match(text,/手動の要復習:/);assert.match(text,/要復習:設定/);assert.match(text,/要復習:解除/);
});

test('validation rejects malformed flag values, answer leakage, incompatible schema, and ID collisions',()=>{
  for(const value of [undefined,null,0,1,'true','false',{},[]])assert.throws(()=>validateHistory(withEvents(flag(value)),questions));
  for(const value of [true,false])assert.doesNotThrow(()=>validateHistory(withEvents(flag(value)),questions));
  assert.throws(()=>validateHistory(withEvents(flag(true,undefined,{selectedAnswer:'イ'})),questions));
  assert.throws(()=>validateHistory(withEvents(flag(true,undefined,{officialCorrectAnswer:'イ'})),questions));
  assert.throws(()=>validateHistory({...freshHistory(),schemaVersion:4},questions));
  const a=flag(true),b={...a,reviewRequired:false};
  assert.throws(()=>previewMerge(withEvents(a),withEvents(b)));
});

test('blocked storage keeps flags in memory and a recoverable JSON export',()=>{
  const storage=new Storage();storage.setItem=()=>{throw Error('quota');};
  const store=new HistoryStore(storage,questions);assert.equal(store.status,'blocked');
  assert.equal(store.toggleReview(q,ctx),false);
  assert.equal(questionStats(store.history,q.id).manualReview,true);
  const backup=validateHistory(exportHistory(store.history,ctx.dataVersion,questions),questions);
  assert.equal(questionStats(backup,q.id).manualReview,true);
  assert.equal(store.toggleReview(q,ctx),false);assert.equal(questionStats(store.history,q.id).manualReview,false);
});

test('protected storage is never overwritten by flags and explicit recovery protects exact original',()=>{
  const storage=new Storage();const raw='{broken-json';storage.setItem(STORAGE_KEY,raw);
  const store=new HistoryStore(storage,questions);assert.equal(store.status,'protected');
  assert.equal(store.toggleReview(q,ctx),false);assert.equal(storage.getItem(STORAGE_KEY),raw);
  assert.equal(questionStats(store.history,q.id).manualReview,true);
  assert.equal(store.recover(false),false);assert.equal(storage.getItem(STORAGE_KEY),raw);
  assert.equal(store.recover(true),true);assert.equal(store.status,'ok');
  assert.equal(storage.getItem(store.recoveryKey),raw);
  assert.equal(questionStats(new HistoryStore(storage,questions).history,q.id).manualReview,true);
});

test('numeric timestamp ordering and future-clock toggles use the actual latest state',()=>{
  const exact=flag(true,'2099-01-01T00:00:00Z',{id:'z'});
  const later=flag(false,'2099-01-01T00:00:00.500Z',{id:'a'});
  assert.deepEqual(ordered([later,exact]).map(e=>e.id),['z','a']);
  const {store,storage}=setup();store.merge(withEvents(later,exact));
  assert.equal(questionStats(store.history,q.id).manualReview,false);
  assert.equal(store.toggleReview(q,ctx),true);
  const newest=store.history.events.at(-1);
  assert.ok(Date.parse(newest.occurredAt)>Date.parse(later.occurredAt));
  assert.equal(questionStats(store.history,q.id).manualReview,true);
  const reloaded=new HistoryStore(storage,questions);reloaded.toggleReview(q,ctx);
  assert.equal(questionStats(reloaded.history,q.id).manualReview,false);
  assert.ok(Date.parse(reloaded.history.events.at(-1).occurredAt)>Date.parse(newest.occurredAt));
});

test('same-timestamp review conflicts use deterministic ID order independent of merge direction',()=>{
  const a=flag(true,'2026-10-20T00:00:00Z',{id:'a'}),z=flag(false,'2026-10-20T00:00:00.000Z',{id:'z'});
  for(const merged of [previewMerge(withEvents(a),withEvents(z)),previewMerge(withEvents(z),withEvents(a))])assert.equal(questionStats(merged.history,q.id).manualReview,false);
});

test('toggle refreshes another tab before choosing its new value',()=>{
  const storage=new Storage();const live=new HistoryStore(storage,questions),stale=new HistoryStore(storage,questions);
  live.toggleReview(q,ctx);assert.equal(questionStats(stale.history,q.id).manualReview,false);
  stale.toggleReview(q,ctx);assert.equal(questionStats(stale.history,q.id).manualReview,false);
  live.refresh();assert.equal(questionStats(live.history,q.id).manualReview,false);
  assert.equal(live.history.events.filter(e=>e.type==='review-flag').length,2);
});

test('legacy migration is deterministic, leaves saved run untouched, and merges independently',()=>{
  const run=legacyRun(),snapshot=JSON.stringify(run),empty=freshHistory();
  const first=legacyPaperReviewEvents(run,questions,empty);
  const second=legacyPaperReviewEvents(JSON.parse(snapshot),questions,empty);
  assert.deepEqual(first,second);assert.equal(first.length,1);assert.equal(JSON.stringify(run),snapshot);
  assert.equal(first[0].occurredAt,'2026-10-19T08:00:00.000Z');assert.equal(first[0].reviewFlagSource,'legacy-paper-v1');
  assert.doesNotThrow(()=>validateHistory(withEvents(...first),questions));
  assert.equal(previewMerge(withEvents(...first),withEvents(...second)).added,0);
  assert.deepEqual(legacyPaperReviewEvents(run,questions,withEvents(...first)),[]);
  const storage=new Storage();const a=new HistoryStore(storage,questions),b=new HistoryStore(storage,questions);
  assert.equal(a.commit(withEvents(...first)),true);assert.equal(b.commit(withEvents(...second)),true);assert.equal(b.status,'ok');
});

test('legacy migration uses stable invalid-date fallback and skips explicit flags',()=>{
  const run=legacyRun();run.startedAt='not-a-date';
  assert.equal(legacyPaperReviewEvents(run,questions,freshHistory())[0].occurredAt,'1970-01-01T00:00:00.000Z');
  for(const value of [true,false])assert.deepEqual(legacyPaperReviewEvents(run,questions,withEvents(flag(value))),[]);
});

test('explicit clear always overrides legacy migration, even future-dated or imported later',()=>{
  const run=legacyRun();run.startedAt='2099-01-01T00:00:00Z';
  const legacy=legacyPaperReviewEvents(run,questions,freshHistory());
  const clear=flag(false,'2026-10-20T00:00:00Z');
  for(const history of [previewMerge(withEvents(clear),withEvents(...legacy)).history,previewMerge(withEvents(...legacy),withEvents(clear)).history]) {
    assert.equal(questionStats(history,q.id).manualReview,false);
    assert.equal(questionStats(validateHistory(exportHistory(history,ctx.dataVersion,questions),questions),q.id).manualReview,false);
    const {store}=setup();store.merge(history);store.toggleReview(q,ctx);
    assert.equal(questionStats(store.history,q.id).manualReview,true);
    store.toggleReview(q,ctx);assert.equal(questionStats(store.history,q.id).manualReview,false);
  }
});

test('stale legacy migration cannot resurrect a flag explicitly cleared in another tab',()=>{
  const storage=new Storage();const stale=new HistoryStore(storage,questions),live=new HistoryStore(storage,questions);
  const run=legacyRun();run.startedAt='2099-01-01T00:00:00Z';
  live.toggleReview(q,ctx);live.toggleReview(q,ctx);
  const legacy=legacyPaperReviewEvents(run,questions,stale.history);
  assert.equal(stale.commit(withEvents(...legacy)),true);
  assert.equal(questionStats(stale.history,q.id).manualReview,false);
  assert.equal(stale.status,'ok');
});
