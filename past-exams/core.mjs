export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'denki.official-pastpapers.history.v2';
export const LEGACY_KEY = 'denki.official-pastpapers.history.v1';
export const CHOICES = ['イ', 'ロ', 'ハ', 'ニ'];
let lastClock = 0;
const eventTime = () => { lastClock = Math.max(Date.now(),lastClock+1); return new Date(lastClock).toISOString(); };
const TYPES = new Set(['view', 'help', 'prior-exposure', 'reveal', 'attempt']);
const LIMIT = 100000;
export const freshHistory = () => ({ format: 'denki-pastpaper-history', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, events: [] });
export const uid = () => globalThis.crypto?.randomUUID?.() || `e-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const ordered = events => [...events].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
function stable(value) { return JSON.stringify(value, Object.keys(value).sort()); }
function assert(ok, message) { if (!ok) throw new Error(message); }
const text = (s, max=200) => typeof s === 'string' && s.length > 0 && s.length <= max;
export function validateHistory(value, questions=null) {
  const catalog=questions?new Map(questions.map(q=>[q.id,q])):null;
  assert(value && !Array.isArray(value) && typeof value === 'object', '履歴の形式が正しくありません。');
  assert(value.format === 'denki-pastpaper-history', 'このアプリの履歴ファイルではありません。');
  assert([1, SCHEMA_VERSION].includes(value.schemaVersion), '未対応の履歴バージョンです。元ファイルはそのまま保管してください。');
  assert(Array.isArray(value.events) && value.events.length <= LIMIT, '履歴の件数または形式を確認してください。');
  const seen = new Map();
  for (const e of value.events) {
    assert(e && typeof e === 'object' && !Array.isArray(e), '不正な記録があります。');
    assert(text(e.id,160) && TYPES.has(e.type), '記録IDまたは種類が不正です。');
    assert(text(e.questionId) && text(e.examId) && Number.isInteger(e.number) && e.number >= 1 && e.number <= 50, '問題情報が不正です。');
    assert(text(e.topic) && text(e.visitId,160) && text(e.sessionId,160), '記録の識別情報が不足しています。');
    assert(text(e.appVersion,60) && text(e.dataVersion,100), '記録のバージョンが不足しています。');
    assert(typeof e.occurredAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(e.occurredAt) && Number.isFinite(Date.parse(e.occurredAt)), '日時が不正です。');
    if(catalog){const q=catalog.get(e.questionId);if(q){assert(q.examId===e.examId && q.number===e.number,'問題ID・実施回・番号が現在の問題集と一致しません。取り込みは中止されました。');if(e.type==='attempt')assert(e.officialCorrectAnswer===q.answer,'公式正答と一致しない記録があります。取り込みは中止されました。');}else{assert(/^d2-\d{8}$/.test(e.examId)&&e.questionId===`${e.examId}-${String(e.number).padStart(2,'0')}`,'未収録問題の識別情報が不正です。');}}
    if (e.type === 'attempt') {
      assert(CHOICES.includes(e.officialCorrectAnswer), '正答情報が不正です。');
      assert(e.selectedAnswer === null || CHOICES.includes(e.selectedAnswer), '選択した解答が不正です。');
      const expected = e.selectedAnswer === null ? 'skip' : e.selectedAnswer === e.officialCorrectAnswer ? 'correct' : 'incorrect';
      assert(e.result === expected, '採点結果と解答が一致しません。');
      assert(typeof e.firstAttempt === 'boolean' && typeof e.firstEncounterUnaided === 'boolean', '初回情報が不足しています。');
      for (const key of ['priorExposure','helpUsed','answerRevealed']) assert(typeof e[key] === 'boolean', '学習条件が不足しています。');
    } else {
      assert(!('officialCorrectAnswer' in e) && !('selectedAnswer' in e), '未解答の記録に解答が含まれています。');
    }
    if (seen.has(e.id)) assert(stable(seen.get(e.id)) === stable(e), '同じ記録IDに異なる内容があります。取り込みを中止しました。');
    seen.set(e.id,e);
  }
  return { ...freshHistory(), events: ordered([...seen.values()]), migratedFrom: value.schemaVersion === 1 ? 1 : undefined };
}
export function previewMerge(current, incoming) {
  const a = validateHistory(current), b = validateHistory(incoming);
  const byId = new Map(a.events.map(e => [e.id,e]));
  let duplicates = 0;
  for (const e of b.events) {
    if (byId.has(e.id)) { assert(stable(byId.get(e.id)) === stable(e), '同じ記録IDに異なる内容があります。元の履歴は変更していません。'); duplicates++; }
    else byId.set(e.id,e);
  }
  const events = ordered([...byId.values()]);
  assert(events.length <= LIMIT, '統合後の記録数が上限を超えます。');
  return { history: {...freshHistory(),events}, added: events.length-a.events.length, duplicates, incomingAttempts: b.events.filter(e=>e.type==='attempt').length };
}
export function eventsFor(history, id) { return ordered(history.events.filter(e=>e.questionId===id)); }
export function makeEvent(type, question, context, extra={}) {
  return {id:uid(),type,questionId:question.id,examId:question.examId,number:question.number,topic:question.topic,occurredAt:eventTime(),visitId:context.visitId,sessionId:context.sessionId,appVersion:APP_VERSION,dataVersion:context.dataVersion,...extra};
}
export function conditions(history, questionId, visitId) {
  const es=eventsFor(history,questionId), previousAttempts=es.filter(e=>e.type==='attempt').length;
  const priorExposure=es.some(e=>(e.type==='view' && e.visitId!==visitId)||e.type==='prior-exposure');
  const helpUsed=es.some(e=>e.type==='help');
  const answerRevealed=es.some(e=>e.type==='reveal'||(e.type==='attempt' && e.answerRevealed));
  return {currentVisitHelpUsed:es.some(e=>e.type==='help'&&e.visitId===visitId),currentVisitAnswerRevealed:es.some(e=>e.type==='reveal'&&e.visitId===visitId),firstAnswer:!es.some(e=>e.type==='attempt'&&e.result!=='skip'),firstAttempt:previousAttempts===0,firstEncounterUnaided:previousAttempts===0&&!priorExposure&&!helpUsed&&!answerRevealed,priorExposure,helpUsed,answerRevealed};
}
export function makeAttempt(history, q, context, answer) {
  assert(answer === null || CHOICES.includes(answer),'解答を選んでください。');
  return makeEvent('attempt',q,context,{scoringBasis:'historical_official',lawStatus:q.lawAudit?.status||'needs_review',lawAuditVersion:q.lawAudit?.version||null,currentCorrectAnswer:q.lawAudit?.currentCorrect||null,excludedFromCurrentPractice:!!q.excluded,selectedAnswer:answer,officialCorrectAnswer:q.answer,result:answer===null?'skip':answer===q.answer?'correct':'incorrect',...conditions(history,q.id,context.visitId)});
}
export function questionStats(history, id) {
  const es=eventsFor(history,id), attempts=es.filter(e=>e.type==='attempt');
  const first=attempts[0]||null, last=attempts.at(-1)||null;
  // Recompute from event sequence. Never trust imported first-attempt claims.
  let clean=false;
  if(first){
    const before=es.filter(e=>e.occurredAt<first.occurredAt || (e.occurredAt===first.occurredAt && e.type!=='attempt'));
    clean=first.firstEncounterUnaided && !first.helpUsed && !first.answerRevealed && !first.priorExposure && !before.some(e=>['help','prior-exposure','reveal'].includes(e.type)||(e.type==='view'&&e.visitId!==first.visitId));
  }
  return {firstAnswer:attempts.find(e=>e.result!=='skip')||null,seen:es.some(e=>e.type==='view')||attempts.length>0,attempts,first,last,cleanFirst:clean,answered:attempts.some(e=>e.result!=='skip'),needsReview:!!last&&(last.result!=='correct'||(last.currentVisitHelpUsed??last.helpUsed)||(last.currentVisitAnswerRevealed??last.answerRevealed)||(attempts.length===1&&!clean)),previousHelp:es.some(e=>e.type==='help'),previousReveal:es.some(e=>e.type==='reveal')};
}
export function summarize(history, questions) {
  const knownIds=new Set(questions.map(q=>q.id));
  const out={unavailableEvents:history.events.filter(e=>!knownIds.has(e.questionId)).length,total:questions.length,seen:0,answered:0,unanswered:0,attempts:0,skips:0,cleanAnswered:0,cleanCorrect:0,firstAnsweredCorrect:0,assistedFirst:0,retryAttempts:0,needsReview:0,skippedOnly:0,revealedOnly:0,helpOnly:0,unseen:0,excluded:0,topics:{}};
  for(const q of questions){
    const s=questionStats(history,q.id);
    if(q.excluded)out.excluded++;if(!s.seen)out.unseen++;if(s.attempts.length&&!s.answered)out.skippedOnly++;if(s.previousReveal&&!s.answered)out.revealedOnly++;if(s.previousHelp&&!s.attempts.length)out.helpOnly++;
    if(s.firstAnswer?.result==='correct')out.firstAnsweredCorrect++; if(s.seen)out.seen++; if(s.answered)out.answered++; else out.unanswered++;
    out.attempts+=s.attempts.length;out.skips+=s.attempts.filter(e=>e.result==='skip').length;out.retryAttempts+=Math.max(0,s.attempts.length-1);
    if(s.first&&s.first.result!=='skip'&&!q.excluded){if(s.cleanFirst){out.cleanAnswered++;if(s.first.result==='correct')out.cleanCorrect++;}else out.assistedFirst++;}
    if(s.needsReview&&!q.excluded)out.needsReview++;
    const t=out.topics[q.topic] ||= {label:q.topicLabel||q.topic,total:0,cleanAnswered:0,cleanCorrect:0,needsReview:0,unanswered:0};
    t.total++;if(!s.answered)t.unanswered++;if(s.needsReview&&!q.excluded)t.needsReview++;if(s.cleanFirst&&!q.excluded&&s.first?.result!=='skip'){t.cleanAnswered++;if(s.first.result==='correct')t.cleanCorrect++;}
  }
  return out;
}
export function filteredQuestions(questions,history,filters) {
  return questions.filter(q=>{
    if(filters.validity!=='all' && (filters.validity==='historical' ? !q.excluded : q.excluded))return false;
    if(filters.year && String(q.year)!==String(filters.year))return false;
    if(filters.exam && q.examId!==filters.exam)return false;
    if(filters.topic && q.topic!==filters.topic)return false;
    if(filters.nonCalculation && q.calculation)return false;
    const s=questionStats(history,q.id);
    if(filters.mode==='unseen'&&s.seen)return false;
    if(filters.mode==='retry'&&!s.needsReview)return false;
    if(filters.mode==='unanswered'&&s.answered)return false;
    return true;
  });
}
export function exportHistory(history,dataVersion,questions=null) {
  const events=ordered(history.events), counts=new Map(), answered=new Set(), statsCache=new Map();
  const stat=id=>{if(!statsCache.has(id))statsCache.set(id,questionStats(history,id));return statsCache.get(id);};
  const attemptIndex=events.filter(e=>e.type==='attempt').map(e=>{const n=(counts.get(e.questionId)||0)+1;counts.set(e.questionId,n);const firstSelectedAnswer=e.result!=='skip'&&!answered.has(e.questionId);if(e.result!=='skip')answered.add(e.questionId);return {eventId:e.id,questionId:e.questionId,attemptNumber:n,firstSelectedAnswer,cleanFirstEncounter:n===1&&stat(e.questionId).cleanFirst};});
  return {...freshHistory(),dataVersion,exportedAt:new Date().toISOString(),classificationNote:'各イベントの初回フラグは記録時点の状態です。統合後の試行順はattemptIndex、成績はsummaryを参照してください。',attemptIndex,...(questions?{summary:summarize(history,questions)}:{}),events};
}
export function summaryText(history,questions,dataVersion){
  const s=summarize(history,questions);
  const lines=['第二種電気工事士 公式過去問｜piyoへ共有する学習記録',`作成日時: ${new Date().toISOString()}`,`アプリ: ${APP_VERSION} / 問題データ: ${dataVersion}`,`全${s.total}問 / 表示済み${s.seen}問 / 解答済み${s.answered}問 / 未解答${s.unanswered}問`,`各問題の最初の選択回答: ${s.firstAnsweredCorrect}/${s.answered}問正解（既見・ヒントありを含む）`,`初見・自力の初回答: ${s.cleanCorrect}/${s.cleanAnswered}問正解${s.cleanAnswered?` (${Math.round(100*s.cleanCorrect/s.cleanAnswered)}%)`:'（まだ判定なし）'}`,`現在の問題集にない履歴:${s.unavailableEvents}件（保管のみ・成績対象外）`,`未表示:${s.unseen}問 / スキップのみ:${s.skippedOnly}問 / 正答表示・未解答:${s.revealedOnly}問 / ヒントのみ:${s.helpOnly}問 / 現行基準での通常練習対象外:${s.excluded}問`,`初回でも既見・ヒントあり: ${s.assistedFirst}問 / 再挑戦: ${s.retryAttempts}回 / スキップ: ${s.skips}回`,'※ 未解答を正解・不正解に含めません。再挑戦の正解を初見成績に混ぜません。','※ 端末の記録だけです。別端末・学習前の経験は申告された分だけを含みます。','※ ヒント・既見・正答表示は、この問題の過去の記録も含みます。初見成績は現在の通常練習対象のみです。','※ 経過時間は計測していません。','', '分野別（初見・自力の初回答）'];
  for(const t of Object.values(s.topics))lines.push(`${t.label}: ${t.cleanCorrect}/${t.cleanAnswered}問正解 / 全${t.total}問 / 未解答${t.unanswered}問 / 復習候補${t.needsReview}問`);
  lines.push('','解答記録（全試行）');
  const qmap=new Map(questions.map(q=>[q.id,q]));
  const count=new Map(), chosen=new Set(), statCache=new Map();
  const stat=id=>{if(!statCache.has(id))statCache.set(id,questionStats(history,id));return statCache.get(id);};
  for(const e of ordered(history.events)){if(e.type!=='attempt')continue;count.set(e.questionId,(count.get(e.questionId)||0)+1);const q=qmap.get(e.questionId);const firstChoice=e.result!=='skip'&&!chosen.has(e.questionId);if(e.result!=='skip')chosen.add(e.questionId);const effectiveClean=count.get(e.questionId)===1&&stat(e.questionId).cleanFirst;lines.push(`${e.occurredAt} | ${q?.examTitle||e.examId} 問${e.number} | ${e.questionId} | ${q?.topicLabel||e.topic} | ${count.get(e.questionId)===1?'初回試行':'再挑戦'} | 選択:${e.selectedAnswer||'なし'} / 公式正答:${e.officialCorrectAnswer} | ${e.result==='correct'?'正解':e.result==='incorrect'?'不正解':'スキップ'} | 初見自力:${effectiveClean?'はい':'いいえ'} / 既見:${e.priorExposure?'あり':'なし'} / ヒント:${e.helpUsed?'あり':'なし'} / 正答表示:${e.answerRevealed?'あり':'なし'} / 最初の選択回答:${firstChoice?'はい':'いいえ'} / 採点基準:当時の公式解答 / 現行確認:${e.lawStatus||'未記録'}`);}
  lines.push('','表示・補助の記録（表示・補助のみの記録には正答を含みません）');
  for(const e of ordered(history.events))if(e.type!=='attempt')lines.push(`${e.occurredAt} | ${e.questionId} | ${e.type}`);
  lines.push('','piyoへ: 初見と再挑戦を分けて、間違えた問題・未解答の分野と次に取り組む問題を整理してください。');
  return lines.join('\n');
}
export class HistoryStore {
  constructor(storage,questions=null){this.storage=storage;this.questions=questions;this.history=freshHistory();this.status='ok';this.raw=null;this.sourceKey=STORAGE_KEY;this.message='このブラウザに保存中';this.load();}
  fail(status,message,raw=null){this.status=status;this.message=message;if(raw!==null)this.raw=raw;}
  load(){
    let raw=null, legacy=false, parsed;
    try { raw=this.storage.getItem(STORAGE_KEY);if(raw===null){raw=this.storage.getItem(LEGACY_KEY);legacy=raw!==null;} }
    catch {this.fail('blocked','ブラウザへの保存が使えません。この画面を閉じる前にJSONを保存してください。');return;}
    if(raw!==null){
      this.raw=raw;this.sourceKey=legacy?LEGACY_KEY:STORAGE_KEY;
      try{parsed=JSON.parse(raw);this.history=validateHistory(parsed,this.questions);}
      catch{this.fail('protected','以前の履歴を安全に読み込めないため、上書きを止めています。元データを救出して保管してください。',raw);return;}
    }
    try{
      if(raw!==null&&(legacy||parsed.schemaVersion!==SCHEMA_VERSION)){const backup=`${this.sourceKey}.pre-migration`;if(this.storage.getItem(backup)===null)this.storage.setItem(backup,raw);this.storage.setItem(STORAGE_KEY,JSON.stringify(this.history));this.message='旧記録を保護して新しい形式に移行しました';}
      const probe=`${STORAGE_KEY}.probe`;this.storage.setItem(probe,'1');this.storage.removeItem(probe);
    }catch{this.fail('blocked','以前の履歴は読み込めましたが、保存ができません。今の学習は閉じる前にJSONを保存してください。',raw);}
  }
  commit(next){
    let merged=previewMerge(this.history,next).history;
    if(this.status==='ok'){
      try{const raw=this.storage.getItem(STORAGE_KEY);if(raw!==null){let disk;try{disk=validateHistory(JSON.parse(raw),this.questions);}catch{this.fail('protected','別の画面の履歴を読み込めないため、上書きを止めました。元データを救出して保管してください。',raw);this.history=merged;return false;}merged=previewMerge(merged,disk).history;}
        this.storage.setItem(STORAGE_KEY,JSON.stringify(merged));this.history=merged;return true;
      }catch(error){this.fail('blocked','保存できませんでした。今の学習はこの画面内だけです。閉じる前にJSONを保存してください。');}
    }
    this.history=merged;return false;
  }
  append(event){return this.commit({...freshHistory(),events:[event]});}
  merge(incoming){const preview=previewMerge(this.history,validateHistory(incoming,this.questions));this.commit(preview.history);return preview;}
  recover(confirmProtected=false){
    try{
      const raw=this.storage.getItem(STORAGE_KEY);
      let disk=null;
      if(raw!==null){try{disk=validateHistory(JSON.parse(raw),this.questions);}catch{
        if(!confirmProtected)throw new Error('元データの保護と復旧の確認が必要です。');
        const key=`${STORAGE_KEY}.recovery.${Date.now()}.${uid()}`;
        this.storage.setItem(key,raw);
        if(this.storage.getItem(key)!==raw)throw new Error('元データを安全に保護できませんでした。');
        this.recoveryRaw=raw;this.recoveryKey=key;
      }}
      const merged=disk?previewMerge(this.history,disk).history:this.history;
      this.storage.setItem(STORAGE_KEY,JSON.stringify(merged));
      this.history=merged;this.status='ok';this.message='履歴の保存を復旧しました';return true;
    }catch(error){this.message=`保存を復旧できませんでした。${error.message} この画面を閉じる前にJSONを保存してください。`;return false;}
  }
  refresh(){if(this.status!=='ok')return;try{const raw=this.storage.getItem(STORAGE_KEY);if(raw!==null){this.raw=raw;this.history=previewMerge(this.history,validateHistory(JSON.parse(raw),this.questions)).history;}}catch{this.fail('protected','他の画面の変更を安全に読めません。元データは上書きしません。',this.raw);}}
}
