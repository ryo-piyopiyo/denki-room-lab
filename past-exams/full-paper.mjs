import {CHOICES,uid,makeEvent,makeAttempt,freshHistory,validateHistory,conditions,questionStats} from './core.mjs?v=1.7.0';
export const PAPER_PREFIX='denki.official-pastpapers.paper.v1.';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function paperSummary(run,questions){const eligible=questions.filter(q=>!q.excluded);const answered=eligible.filter(q=>CHOICES.includes(run.answers[q.id]));return {total:questions.length,eligible:eligible.length,excluded:questions.length-eligible.length,answered:answered.length,unanswered:eligible.length-answered.length,correct:answered.filter(q=>run.answers[q.id]===q.answer).length,incorrect:answered.filter(q=>run.answers[q.id]!==q.answer).length};}
export function firstUnansweredIndex(run,questions){return questions.findIndex(q=>!q.excluded&&!CHOICES.includes(run.answers[q.id]));}
export function questionNumberIndex(questions,value){const number=Number(value);return String(value).trim()&&Number.isInteger(number)?questions.findIndex(q=>q.number===number):-1;}
export function createPaperRun(exam,questions,dataVersion){return {version:1,id:uid(),examId:exam.id,dataVersion,startedAt:new Date().toISOString(),revision:0,position:0,answers:{},visits:{},flags:{},submittedAt:null,events:null,questionIds:questions.map(q=>q.id)};}
export function validatePaperRun(value,questions,dataVersion){
  if(!value||value.version!==1||typeof value.id!=='string'||!/^[-\w]+$/.test(value.id)||!Number.isInteger(value.revision)||value.revision<0||value.dataVersion!==dataVersion||!Number.isInteger(value.position)||value.position<0||value.position>=questions.length||JSON.stringify(value.questionIds)!==JSON.stringify(questions.map(q=>q.id)))throw Error('問題データまたは保存形式が一致しません。');
  for(const field of ['answers','visits','flags'])if(!value[field]||typeof value[field]!=='object'||Array.isArray(value[field]))throw Error('保存形式が不正です。');
  const ids=new Set(questions.map(q=>q.id));
  for(const [id,answer] of Object.entries(value.answers))if(!ids.has(id)||!CHOICES.includes(answer))throw Error('解答データが不正です。');
  for(const [id,visit] of Object.entries(value.visits))if(!ids.has(id)||typeof visit!=='string'||!visit)throw Error('表示記録が不正です。');
  if(value.submittedAt){if(!Array.isArray(value.events))throw Error('採点記録がありません。');validateHistory({...freshHistory(),events:value.events},questions);}
  return value;
}
export function preparePaperSubmission(run,questions,history){
  if(run.submittedAt)return run;
  const events=questions.filter(q=>!q.excluded).map(q=>{const ctx={visitId:run.visits[q.id]||uid(),sessionId:run.id,dataVersion:run.dataVersion};const attempt=makeAttempt(history,q,ctx,run.answers[q.id]||null);return {...attempt,id:`paper-${run.id}-${q.number}`,practiceMode:'full-paper',paperId:run.id};});
  const reveals=events.map(attempt=>({...makeEvent('reveal',questions.find(q=>q.id===attempt.questionId),{visitId:attempt.visitId,sessionId:run.id,dataVersion:run.dataVersion}),id:`paper-reveal-${run.id}-${attempt.number}`,practiceMode:'full-paper',paperId:run.id}));
  return {...run,submittedAt:new Date().toISOString(),events:[...events,...reveals]};
}
export function legacyPaperReviewEvents(run,questions,history){
  const explicit=new Set(history.events.filter(e=>e.type==='review-flag').map(e=>e.questionId));
  return questions.filter(q=>run.flags[`${q.id}:review`]===true&&!explicit.has(q.id)).map(q=>({
    ...makeEvent('review-flag',q,{visitId:`legacy-${run.id}`,sessionId:run.id,dataVersion:run.dataVersion},{reviewRequired:true,reviewFlagSource:'legacy-paper-v1',practiceMode:'full-paper',paperId:run.id}),
    id:`legacy-paper-review-${run.id}-${q.number}`,appVersion:'1.7.0',
    occurredAt:Number.isFinite(Date.parse(run.startedAt))?new Date(run.startedAt).toISOString():'1970-01-01T00:00:00.000Z'
  }));
}
export function mountFullPaper({root,data,questions,store,storage,imageButton,explanation,knowledge,onHistory}){
  let run=null,raw=null,notice='',reviewId=null,confirmSubmit=false,saveFailed=false;
  const paperQuestions=id=>questions.filter(q=>q.examId===id).sort((a,b)=>a.number-b.number);
  const examTitle=id=>{const exam=data.exams.find(e=>e.id===id);return exam?.title||exam?.label||id;};
  const button=(text,action,cls='secondary')=>{const b=el('button',cls,text);b.type='button';b.onclick=action;return b;};
  function save(next){
    try{const disk=storage.getItem(PAPER_PREFIX+next.id);if(disk!==raw){notice='別のタブでこの回が更新されました。「保存済みの回」から開き直してください。';return false;}
      next={...next,revision:next.revision+1};const text=JSON.stringify(next);storage.setItem(PAPER_PREFIX+next.id,text);if(storage.getItem(PAPER_PREFIX+next.id)!==text)throw Error('保存確認に失敗');raw=text;run=next;saveFailed=false;notice='';return true;
    }catch{run=next;saveFailed=true;notice='通し練習の途中経過を保存できません。この画面を閉じると失われます。採点後の履歴は「piyoに共有」からJSON保存してください。';return true;}
  }
  function recordVisit(q){if(q.excluded||run.visits[q.id]||run.submittedAt)return;
    const visit=uid();if(!save({...run,visits:{...run.visits,[q.id]:visit}}))return;
    store.append(makeEvent('view',q,{visitId:visit,sessionId:run.id,dataVersion:run.dataVersion},{practiceMode:'full-paper',paperId:run.id}));onHistory();
  }
  function focusResult(){const title=root.querySelector('#paper-result-title');title?.focus({preventScroll:true});title?.scrollIntoView({block:'start',behavior:'instant'});}
  function open(id){try{const text=storage.getItem(PAPER_PREFIX+id);const value=JSON.parse(text);run=validatePaperRun(value,paperQuestions(value.examId),data.dataVersion);raw=text;notice='';saveFailed=false;reviewId=null;confirmSubmit=false;render();if(run.submittedAt)focusResult();}catch{run=null;notice='保存済みの回を安全に読み込めませんでした。元データは変更していません。';render();}}
  function persistSubmission(){if(!run?.submittedAt)return;store.commit({...freshHistory(),events:run.events});onHistory();}
  function navigate(index){if(!run||run.submittedAt||!Number.isInteger(index)||index<0||index>=paperQuestions(run.examId).length)return;confirmSubmit=false;if(save({...run,position:index})){render();const heading=root.querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});}else render();}
  function reviewButton(q){
    const b=button(questionStats(store.history,q.id).manualReview?'★ 要復習中（解除する）':'☆ 要復習にする',()=>{
      store.toggleReview(q,{visitId:run.visits[q.id]||`review-${run.id}`,sessionId:run.id,dataVersion:run.dataVersion});onHistory();
      // Update in place: retain the current answer, explanation, scroll and keyboard focus.
      for(const node of root.querySelectorAll('[data-paper-review]')){
        const marked=questionStats(store.history,node.getAttribute('data-paper-review')).manualReview;
        node.textContent=marked?'★ 要復習中（解除する）':'☆ 要復習にする';node.setAttribute('aria-pressed',String(marked));
      }
      for(const node of root.querySelectorAll('[data-paper-number]')){
        const item=questions.find(x=>x.id===node.getAttribute('data-paper-number'));
        const marked=questionStats(store.history,item.id).manualReview;
        node.textContent=`${item.number} ${item.excluded?'※':run.answers[item.id]?'○':'―'}${marked?'★':''}`;
        node.setAttribute('aria-label',`問${item.number}、${item.excluded?'採点対象外':run.answers[item.id]?'選択済み':'未解答'}${marked?'、要復習':''}`);
      }
    },'secondary review-toggle');
    b.setAttribute('data-paper-review',q.id);b.setAttribute('aria-pressed',String(questionStats(store.history,q.id).manualReview));return b;
  }
  function render(){
    root.replaceChildren();const head=el('div','section-head');head.append(el('span','eyebrow','ONE COMPLETE PAPER'),el('h1','','1回分を、通して解く。'),el('p','','実施回を選んで問1から順番に。解答は最後の「まとめて採点」まで変更できます。途中では正答・解説を表示しません。'));root.append(head);
    const status=el('p','storage-status',notice||'途中経過はこのブラウザに自動保存します。別のタブで同じ回を同時に操作しないでください。');status.setAttribute('role','status');root.append(status);
    const setup=el('div','panel');const label=el('label','','実施回');const select=el('select');select.id='paper-exam';for(const exam of data.exams){const opt=el('option','',examTitle(exam.id));opt.value=exam.id;select.append(opt);}if(run)select.value=run.examId;label.append(select);setup.append(label,el('p','small quiet','計算問題も含めて収録順に取り組みます。法令変更などの要注意問題は番号を残し、解答・採点から除外します。時間制限はありません。'));
    const startButton=button('新しく1回分をはじめる',()=>{const qs=paperQuestions(select.value);const next=createPaperRun(data.exams.find(e=>e.id===select.value),qs,data.dataVersion);raw=null;if(save(next)){reviewId=null;confirmSubmit=false;render();}else render();},'primary');startButton.disabled=!!(saveFailed&&run&&!run.submittedAt);setup.append(startButton);
    setup.append(el('p','small quiet',saveFailed?'途中経過を保存できないため、新しく始める前にこの回を採点し、学習履歴JSONを保存してください。':'新しく始めても、前の回の途中経過・結果は下の一覧に残ります。途中経過は学習履歴JSONには含まれません。採点済みの解答は従来の履歴にも記録します。'));
    const saved=el('details');saved.append(el('summary','','保存済みの回・途中から再開'));try{const values=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PAPER_PREFIX)){try{const v=JSON.parse(storage.getItem(key));if(v?.id&&v.examId)values.push(v);}catch{}}}values.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));for(const v of values){const row=el('div','paper-saved-row');row.append(button(`${examTitle(v.examId)} · ${v.submittedAt?'採点済み':'途中'} · ${new Date(v.startedAt).toLocaleString('ja-JP')}`,()=>open(v.id)));saved.append(row);}if(!values.length)saved.append(el('p','','保存済みの回はありません。'));}catch{saved.append(el('p','','ブラウザ保存が使えません。'));}setup.append(saved);root.append(setup);
    if(!run)return;
    const qs=paperQuestions(run.examId);store.refresh();const legacy=legacyPaperReviewEvents(run,qs,store.history);if(legacy.length){store.commit({...freshHistory(),events:legacy});onHistory();}if(run.submittedAt){persistSubmission();renderResult(qs);return;}
    const q=qs[run.position];recordVisit(q);status.textContent=notice||(saveFailed?'途中経過はこの画面内のみです。':'途中経過をこのブラウザに保存しています。');const counts=paperSummary(run,qs);
    const panel=el('article','panel question-card');const title=el('h2','',`${examTitle(run.examId)} · 問${q.number} / ${qs.length}`);title.tabIndex=-1;panel.append(title,el('p','',`解答済み ${counts.answered} / ${counts.eligible}問 · 未解答 ${counts.unanswered}問 · 採点対象外 ${counts.excluded}問`));root.append(panel);
    const shortcuts=el('div','paper-shortcuts');
    const jump=el('form','paper-jump');const jumpLabel=el('label','','問題番号');jumpLabel.htmlFor='paper-jump-number';
    const numberInput=el('input');numberInput.id='paper-jump-number';numberInput.type='number';numberInput.inputMode='numeric';numberInput.min=String(qs[0].number);numberInput.max=String(qs.at(-1).number);numberInput.step='1';numberInput.required=true;numberInput.value=String(q.number);
    const jumpButton=button('指定した問題へ',()=>{});jumpButton.type='submit';
    jump.onsubmit=event=>{event.preventDefault();const index=questionNumberIndex(qs,numberInput.value);if(index<0){numberInput.setCustomValidity('1〜50の問題番号を入力してください。');numberInput.reportValidity();return;}navigate(index);};
    numberInput.oninput=()=>numberInput.setCustomValidity('');
    jump.append(jumpLabel,numberInput,jumpButton);shortcuts.append(jump);
    const first=firstUnansweredIndex(run,qs);const unanswered=button(first<0?'未解答はありません':`最初の未解答へ（問${qs[first].number}）`,()=>navigate(first));unanswered.id='paper-first-unanswered';unanswered.disabled=first<0;shortcuts.append(unanswered);
    shortcuts.append(el('p','small quiet','この回で未解答のうち、番号が最も小さい問題へ移動します。採点対象外は飛ばします。'));
    panel.append(shortcuts);
    if(q.excluded){panel.append(el('div','validity-warning','⚠ この問題は、法令変更・現行基準の確認状況により解答・採点の対象外です。全体の正答率にも含めません。通常の「問題を解く」から注意表示付きで確認できます。'));}
    else{
      const stats=questionStats(store.history,q.id), learning=conditions(store.history,q.id,run.visits[q.id]);
      panel.append(el('p','exposure-label',stats.attempts.length?`この端末で${stats.attempts.length}回取り組んだ問題です。再挑戦として記録します。`:learning.priorExposure?'以前に表示済み・既見の問題です。初見の成績とは分けます。':learning.helpUsed||learning.answerRevealed?'補助利用・正答表示の履歴があります。初見・自力とは分けます。':'この通し練習で、はじめて表示した問題です。'));
      panel.append(reviewButton(q),el('p','small quiet','正解しても復習候補に残ります。もう一度押すと解除できます。要復習は学習履歴JSONにも保存されます。'));
      for(const id of q.contextIds||[]){const context=q.contexts.find(c=>c.id===id);if(context){const d=el('details','context-group');d.append(el('summary','',context.title));for(const path of context.images)d.append(imageButton(path,context.title));panel.append(d);}}
      for(const [i,path] of q.images.entries())panel.append(imageButton(path,`${examTitle(run.examId)} 問${q.number} 問題・選択肢 ${i+1}`));
      const field=el('fieldset');field.append(el('legend','','解答をひとつ選ぶ（採点前なら変更できます）'));const choices=el('div','answer-choices');for(const choice of CHOICES){const label=el('label','answer-option');const input=el('input');input.type='radio';input.name='paper-answer';input.value=choice;input.checked=run.answers[q.id]===choice;input.onchange=()=>{save({...run,answers:{...run.answers,[q.id]:choice}});render();root.querySelector(`input[name="paper-answer"][value="${choice}"]`)?.focus({preventScroll:true});};label.append(input,el('span','',choice));choices.append(label);}field.append(choices);panel.append(field);
      panel.append(button('この解答を取り消す',()=>{const answers={...run.answers};delete answers[q.id];save({...run,answers});render();}));
      const flags=el('details','study-conditions');flags.append(el('summary','','以前に見た・ヒントを使った場合'));for(const [type,text] of [['prior-exposure','この端末以外でも、以前にこの問題を見た'],['help','ヒント・解説・他の人の助けを使った']]){const label=el('label','check-label');const input=el('input');input.type='checkbox';input.checked=!!run.flags[`${q.id}:${type}`];input.disabled=input.checked;input.onchange=()=>{if(save({...run,flags:{...run.flags,[`${q.id}:${type}`]:true}})){store.append(makeEvent(type,q,{visitId:run.visits[q.id],sessionId:run.id,dataVersion:run.dataVersion}));onHistory();}render();};label.append(input,el('span','',text));flags.append(label);}panel.append(flags);
      panel.append(el('p','small quiet','選択は途中経過として保存します。学習記録への解答確定は、最後のまとめて採点時です。'));
    }
    const nav=el('div','button-row');const prev=button('← 前の問題',()=>navigate(run.position-1));prev.disabled=run.position===0;nav.append(prev);const next=button('次の問題 →',()=>navigate(run.position+1),'primary');next.disabled=run.position===qs.length-1;nav.append(next);panel.append(nav);
    const map=el('div','panel');map.append(el('h2','','解答状況・番号で移動'),el('p','small quiet','○：選択済み　―：未解答　★：要復習　※：採点対象外。番号を押すと戻って変更できます。'));const grid=el('div','question-numbers');for(const [i,item] of qs.entries()){const b=button(`${item.number} ${item.excluded?'※':run.answers[item.id]?'○':'―'}${questionStats(store.history,item.id).manualReview?'★':''}`,()=>navigate(i),`question-number ${run.answers[item.id]?'answered':''}`);b.setAttribute('data-paper-number',item.id);b.setAttribute('aria-label',`問${item.number}、${item.excluded?'採点対象外':run.answers[item.id]?'選択済み':'未解答'}${questionStats(store.history,item.id).manualReview?'、要復習':''}`);if(i===run.position)b.setAttribute('aria-current','step');grid.append(b);}map.append(grid);root.append(map);
    const end=el('div','panel');end.append(button('解答を終えて、まとめて採点',()=>{confirmSubmit=true;render();root.querySelector('#paper-confirm')?.focus();},'primary'));
    if(confirmSubmit){const confirm=el('div','validity-warning');confirm.id='paper-confirm';confirm.tabIndex=-1;confirm.append(el('h3','','この内容で採点しますか？'),el('p','',`解答済み${counts.answered}問、未解答${counts.unanswered}問、採点対象外${counts.excluded}問、手動の要復習${qs.filter(q=>questionStats(store.history,q.id).manualReview).length}問です。採点後は解答を変更できません。未解答は未解答のまま記録し、不正解とは分けます。`),button('解答に戻る',()=>{confirmSubmit=false;render();}),button('確定して結果を見る',()=>{store.refresh();const next=preparePaperSubmission(run,qs,store.history);if(save(next)){confirmSubmit=false;persistSubmission();}render();if(run.submittedAt)focusResult();},'primary'));end.append(confirm);}root.append(end);
  }
  function renderResult(qs){const s=paperSummary(run,qs);const panel=el('div','panel');const title=el('h2','',`${examTitle(run.examId)} · 結果`);title.id='paper-result-title';title.tabIndex=-1;panel.append(title,el('p','paper-score',`${s.correct} / ${s.eligible}問 正解`),el('p','',`正解 ${s.correct}問 · 不正解 ${s.incorrect}問 · 未解答 ${s.unanswered}問 · 採点対象外 ${s.excluded}問`),el('p','small quiet',`全採点対象に対する正解割合 ${s.eligible?Math.round(100*s.correct/s.eligible):0}%（未解答も分母に含む）。選択回答だけの正答率 ${s.answered?Math.round(100*s.correct/s.answered)+'%':'未回答'}。これは学習用の結果です。公式の得点・合否判定ではありません。`),el('p','small quiet','従来の学習記録では未解答はスキップ扱いです。再挑戦は初見・自力の成績と分けて残します。'));
    const selected=run.events.filter(e=>e.type==='attempt'&&e.selectedAnswer!==null), clean=selected.filter(e=>e.firstEncounterUnaided), repeat=selected.filter(e=>!e.firstAttempt);
    panel.append(el('p','progress-context',`今回の選択回答：初見・自力 ${clean.filter(e=>e.result==='correct').length}/${clean.length}問正解 · 再挑戦 ${repeat.length}問 · 初回でも既見・補助あり ${selected.length-clean.length-repeat.length}問。採点時点の区分です。履歴統合後の最新区分は「学習記録」で確認できます。`));
    if(store.status!=='ok')panel.append(el('p','validity-warning','学習履歴をブラウザに保存できていません。「piyoに共有」からJSONを保存してください。'));
    const list=el('div','paper-result-list');for(const q of qs){const answer=run.answers[q.id];const row=el('div','paper-result-row');row.append(el('span','',`問${q.number} · ${q.excluded?'採点対象外':!answer?'未解答':answer===q.answer?'正解':'不正解'}${!q.excluded?` · 選択 ${answer||'―'} / 正答 ${q.answer}`:''}`));if(!q.excluded)row.append(button('問題・解説を見る',()=>{reviewId=q.id;render();root.querySelector('#paper-review')?.scrollIntoView({block:'start'});}));list.append(row);}panel.append(list);root.append(panel);
    if(reviewId){const q=qs.find(q=>q.id===reviewId);const attempt=run.events.find(e=>e.questionId===reviewId);if(q&&attempt){if(!store.history.events.some(e=>e.id===`paper-reveal-${run.id}-${q.number}`)){store.append({...makeEvent('reveal',q,{visitId:attempt.visitId,sessionId:run.id,dataVersion:run.dataVersion}),id:`paper-reveal-${run.id}-${q.number}`});onHistory();}const review=el('article','panel');review.id='paper-review';review.append(el('h2','',`問${q.number}の振り返り`),reviewButton(q));for(const path of q.images)review.append(imageButton(path,`問${q.number}`));for(const id of q.contextIds||[]){const c=q.contexts.find(c=>c.id===id);if(c)for(const path of c.images)review.append(imageButton(path,c.title));}review.append(explanation(q,attempt),knowledge(q));root.append(review);}}
  }
  return {render};
}
