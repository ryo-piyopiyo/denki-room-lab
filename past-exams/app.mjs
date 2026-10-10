import {APP_VERSION,CHOICES,HistoryStore,uid,makeEvent,makeAttempt,conditions,questionStats,summarize,filteredQuestions,summaryText,exportHistory,validateHistory,previewMerge} from './core.mjs';
const $ = id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
let data,questions,store,queue=[],position=0,current=null,context=null,answered=false,selected=null,screen='learn',pendingImport=null,importReadId=0;
const sessionId=uid();
const safeUrl=url=>{try{const u=new URL(url,location.href);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const sourceLink=(title,url)=>{const a=el('a','',title);const safe=safeUrl(url);if(safe){a.href=safe;a.target='_blank';a.rel='noopener noreferrer';}return a;};
const filters=()=>({year:$('year-filter').value,exam:$('exam-filter').value,topic:$('topic-filter').value,mode:$('mode-filter').value,nonCalculation:$('non-calculation').checked,validity:$('validity-filter').value});
function download(name,text,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function name(ext){return `progress-denki-${new Date().toISOString().slice(0,10)}.${ext}`;}
function refreshStatus(){const n=$('storage-status');n.replaceChildren();n.classList.toggle('warning',store.status!=='ok');n.append(el('span','',store.status==='ok'?`● ${store.message}`:`⚠ ${store.message}`));if(store.status!=='ok'){n.append(el('div','small','記録はpiyoに自動送信されません。新しい記録も「piyoに共有」からJSON保存できます。'));const retry=el('button','secondary',store.status==='protected'?'元データを保護して保存を復旧':'保存をもう一度試す');retry.onclick=()=>{if(store.status==='protected')$('recovery-dialog').showModal();else{store.recover();refreshStatus();}};n.append(retry);if(store.raw!==null){const b=el('button','secondary','元データを変更せず救出する');b.onclick=()=>download(`progress-denki-recovery-${Date.now()}.txt`,store.raw,'text/plain;charset=utf-8');n.append(b);}}}
function append(type,extra={}){store.append(makeEvent(type,current,context,extra));refreshStatus();}
function showScreen(next){screen=next;for(const id of ['learn','progress','share','sources'])$(id+'-screen').hidden=id!==next;document.querySelectorAll('[data-screen]').forEach(b=>{const active=b.dataset.screen===next;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(next==='progress')renderProgress();if(next==='share')renderShare();window.scrollTo({top:0,behavior:'instant'});}
function refreshFilterCount(){const n=filteredQuestions(questions,store.history,filters()).length;$('filter-count').textContent=`${n}問`;$('start').disabled=n===0;}
function imageButton(path,label){const b=el('button','image-button');b.type='button';b.setAttribute('aria-label',`${label}を拡大`);const img=el('img');img.src=path;img.alt=label;img.loading='lazy';const caption=el('span','image-caption','拡大する ↗');b.append(img,caption);b.onclick=()=>openImage(path,label);img.onerror=()=>{caption.textContent='画像を読み込めませんでした。再読み込み、または出典の原本を確認してください。';};return b;}
function openImage(path,label){$('zoom-title').textContent=label;$('zoom-image').src=path;$('zoom-image').alt=label;$('zoom-level').value='1';$('zoom-image').style.width='100%';$('original-image-link').href=path;$('image-dialog').showModal();$('zoom-viewport').scrollTo(0,0);}
function labelExam(exam){return exam.title||exam.label||exam.id;}
function renderQuestion(){
  current=queue[position];if(!current)return;
  context={visitId:uid(),sessionId,dataVersion:data.dataVersion};answered=false;selected=null;
  const before=questionStats(store.history,current.id);
  append('view');
  $('session-area').hidden=false;$('empty-session').hidden=true;
  $('queue-label').textContent=`今回の並び ${position+1} / ${queue.length}問`;
  $('exam-label').textContent=current.examTitle;
  $('question-title').textContent=`問 ${String(current.number).padStart(2,'0')}`;
  $('question-topic').textContent=current.topicLabel||current.topic;
  $('exposure-label').textContent=before.attempts.length?`この端末で${before.attempts.length}回取り組んだ問題です。今回は再挑戦として残します。`:before.seen?'表示したことがある問題です。選択回答はまだありません。':'この端末では、はじめて表示する問題です。';
  const warning=$('validity-warning');warning.hidden=!current.excluded;warning.replaceChildren();
  if(current.excluded){warning.append(el('strong','','⚠ 現行基準の通常練習から除外している問題です'),el('div','',current.lawAudit?.status==='changed_answer'?'法令・基準の変更により、当時の公式正答と現在の正答が異なる問題です。':current.lawAudit?.status==='invalid_or_ambiguous'?'現在の法令・基準では、正答をひとつに定められない問題です。':'現在の法令・規格との一致を確認中です。現行の試験対策として正しいと断定できません。'),el('p','small','ここで表示する正答・採点は2017年当時の公式解答です。現在の知識の正答率には含めません。'));}
  $('question-images').replaceChildren(...current.images.map((path,i)=>imageButton(path,`${current.examTitle} 問${current.number} 問題・選択肢${current.images.length>1?` ${i+1}`:''}`)));
  const choiceNodes=CHOICES.map(c=>{const label=el('label','answer-option');const input=el('input');input.type='radio';input.name='answer';input.value=c;input.setAttribute('aria-label',c);input.onchange=()=>{if(!answered){selected=c;$('grade').disabled=false;}};label.append(input,el('span','',c));return label;});
  $('answer-choices').replaceChildren(...choiceNodes);$('answer-fieldset').disabled=false;$('grade').disabled=true;$('answer-actions').hidden=false;$('reveal').hidden=false;$('result').hidden=true;$('result').replaceChildren();$('next').hidden=true;
  $('known-checkbox').checked=false;$('help-checkbox').checked=false;$('known-checkbox').disabled=false;$('help-checkbox').disabled=false;$('study-conditions').open=false;
  $('record-note').textContent='選択しただけでは記録されません。「採点する」で確定します。';
  const refs=$('question-contexts');refs.replaceChildren();const shortcuts=$('reference-shortcuts');shortcuts.replaceChildren();
  for(const id of current.contextIds||[]){const c=current.contexts.find(x=>x.id===id);if(!c)continue;const direct=el('button','secondary',c.id.includes('wiring')?'この問題の配線図を見る ↗':c.title+' ↗');direct.onclick=()=>openImage(c.images[0],c.title);shortcuts.append(direct);const d=el('details','context-group');d.append(el('summary','',c.title));for(const [i,path] of c.images.entries())d.append(imageButton(path,`${c.title}${c.images.length>1?` ${i+1}`:''}`));refs.append(d);}
  if(!refs.childNodes.length)refs.append(el('p','small quiet','この問題に追加の共通資料はありません。'));
  renderQuestionList();refreshFilterCount();
  $('question-title').focus({preventScroll:true});$('session-area').scrollIntoView({behavior:'instant',block:'start'});
}
function startQueue(list){if(current&&!answered&&position===0&&!$('session-area').hidden&&list.length===queue.length&&list.every((q,i)=>q.id===queue[i].id)){$('session-area').scrollIntoView({behavior:'instant',block:'start'});return;}queue=list;position=0;if(!list.length){$('session-area').hidden=true;$('empty-session').hidden=false;$('empty-session').textContent='この条件の問題はありません。条件を変えて選び直せます。';return;}renderQuestion();}
function displayExplanation(result){
  const ex=current.explanation;const box=el('div','explanation');
  box.append(el('h3','','解き方と、選択肢の読み方'),el('p','author-note','piyoによる学習用解説。試験センターの公式解説ではありません。'));
  if(!ex){box.append(el('p','','この問題の詳しい解説は準備中です。公式正答は上に表示しています。'));return box;}
  if(ex.summary)box.append(el('p','',ex.summary));
  if(ex.reasoning){box.append(el('h4','','どう考える？'),el('p','',Array.isArray(ex.reasoning)?ex.reasoning.join('\n'):ex.reasoning));}
  if(ex.prerequisites?.length){box.append(el('h4','','先に押さえておくこと'));const ul=el('ul');for(const item of ex.prerequisites)ul.append(el('li','',item));box.append(ul);}
  box.append(el('h4','','4つの選択肢を確認'));
  for(const c of CHOICES){const row=el('div','option-explanation');row.append(el('strong','',`${c}${c===current.answer?' · 当時の公式正答':''}${c===result.selectedAnswer?' · あなたの選択':''}`));const content=ex.options?.[c];row.append(el('p','',typeof content==='string'?content:content?Object.values(content).filter(v=>typeof v==='string').join('\n'):'この選択肢の解説は確認中です。'));box.append(row);}
  if(current.lawAudit?.note){box.append(el('h4','','現在の法令・基準との関係'),el('p','',current.lawAudit.note));}
  const sources=[...(ex.sources||[]),...(current.lawAudit?.sources||[])];if(sources.length){const d=el('details');d.append(el('summary','','解説・現行基準の確認資料'));const ul=el('ul');for(const s of sources){const li=el('li');li.append(sourceLink(s.title||s.url,s.url));ul.append(li);}d.append(ul);box.append(d);}
  return box;
}
function submit(answer,{reveal=false}={}){
  if(answered||!current)return;answered=true;
  if(reveal)append('reveal');
  const attempt=makeAttempt(store.history,current,context,answer);store.append(attempt);refreshStatus();
  $('answer-fieldset').disabled=true;$('known-checkbox').disabled=true;$('help-checkbox').disabled=true;$('answer-actions').hidden=true;$('reveal').hidden=true;
  const r=$('result');r.hidden=false;r.className=`result ${attempt.result==='incorrect'?'incorrect':''}`;r.replaceChildren();
  const title=attempt.result==='correct'?'正解です。':attempt.result==='incorrect'?'ここを、いっしょに確認。':reveal?'正答を見て学習しました。':'スキップとして記録しました。';
  r.append(el('h3','',title));
  if(answer!==null||reveal){if(!reveal)append('reveal');r.append(el('p','',`${current.excluded?'2017年当時の公式正答':'公式正答'}：${current.answer}${answer!==null?`　あなたの解答：${answer}`:''}`));r.append(displayExplanation(attempt));}
  else {r.append(el('p','','まだ選択回答はありません。スキップは正答率の分母に入りません。'));const b=el('button','secondary','この問題の正答・解説を見る');b.onclick=()=>{append('reveal');r.append(el('p','',`2017年当時の公式正答：${current.answer}`),displayExplanation(attempt));b.remove();};r.append(b);}
  r.append(el('p','small quiet',attempt.firstEncounterUnaided&&answer!==null&&!current.excluded?'初見・自力の初回答として記録しました。':attempt.firstAttempt?'初回の試行として記録しました。初見・自力の成績とは分けて残します。':'再挑戦として記録しました。初見の成績は変わりません。'));
  $('next').hidden=false;$('next').textContent=position+1<queue.length?'次の1問へ →':'今回の記録を見る →';
  $('record-note').textContent=store.status==='ok'?'解答記録をこのブラウザに保存しました。':'この画面内に記録しました。閉じる前にJSONで保存してください。';
  r.scrollIntoView({behavior:'instant',block:'start'});renderQuestionList();refreshFilterCount();
}
function renderQuestionList(){
  $('total-label').textContent=`全${questions.length}問（要注意問題を含む）`;
  const list=$('question-list');list.replaceChildren();
  list.append(el('p','small quiet','番号から直接開くと表示済みとして記録します。※ は現行基準の通常練習から除外している問題です。'));
  for(const exam of data.exams){const wrap=el('div','exam-list');wrap.append(el('h3','',labelExam(exam)));const grid=el('div','question-numbers');for(const q of questions.filter(q=>q.examId===exam.id)){const s=questionStats(store.history,q.id);const b=el('button',`question-number ${s.needsReview?'review':s.answered?'answered':s.seen?'seen':''} ${q.excluded?'excluded-number':''}`,`${q.number}${q.excluded?'※':''}`);const status=s.answered?'解答済み':s.attempts.length?'スキップのみ':s.seen?'表示済み・未解答':'未表示';b.setAttribute('aria-label',`${labelExam(exam)} 問${q.number}、${status}${q.excluded?'、現行基準の通常練習対象外':''}`);b.onclick=()=>{showScreen('learn');startQueue([q]);};grid.append(b);}wrap.append(grid);list.append(wrap);}
  list.append(el('p','legend-key','白：未表示　灰：表示済み　緑：解答済み　薄橙：復習候補　※：要注意'));
}
function metric(label,value,note){const n=el('div','metric');n.append(el('div','metric-label',label),el('div','metric-value',value),el('p','',note));return n;}
function renderProgress(){
  const s=summarize(store.history,questions);const box=$('progress-content');box.replaceChildren();const metrics=el('div','metric-grid');metrics.append(metric('解答済みの問題',`${s.answered} / ${s.total}`,'選択回答した問題数。スキップのみは未解答。'),metric('初見・自力の正答',s.cleanAnswered?`${s.cleanCorrect} / ${s.cleanAnswered}`:'まだ記録なし',s.cleanAnswered?`対象${s.cleanAnswered}問で${Math.round(100*s.cleanCorrect/s.cleanAnswered)}%。未解答・要注意問題・再挑戦を除外。`:'初めて表示した機会に、自力で答えた回答。'),metric('まだ解答していない',`${s.unanswered} 問`,`未表示${s.unseen}問、スキップのみ${s.skippedOnly}問を含む。`));box.append(metrics);
  box.append(el('p','progress-notes',`全試行${s.attempts}回 / 再挑戦${s.retryAttempts}回 / スキップ${s.skips}回。正答表示・未解答${s.revealedOnly}問、ヒントのみ${s.helpOnly}問。現在の基準では通常練習対象外${s.excluded}問。現在の問題集にない履歴${s.unavailableEvents}件は保管のみで、成績に含めません。`));
  box.append(el('p','progress-context','これは2017年の収録問題での学習記録です。再挑戦で正解できても、試験全体で80%を取れることの保証にはなりません。学習が進んだら、まだ見ていない別の年度で理解を確かめましょう。'));
  const exams=el('div','panel');exams.append(el('h2','','実施回ごとの進み具合'));
  for(const exam of data.exams){const es=summarize(store.history,questions.filter(q=>q.examId===exam.id));const row=el('div','progress-row');const top=el('div','progress-row-top');top.append(el('strong','',labelExam(exam)),el('span','',`解答済み ${es.answered} / ${es.total}問`));row.append(top);const bar=el('div','progress-bar');const fill=el('div');fill.style.width=`${100*es.answered/es.total}%`;bar.append(fill);row.append(bar,el('div','quiet',`初見・自力 ${es.cleanCorrect}/${es.cleanAnswered}問正解 / 未解答${es.unanswered}問 / 通常練習対象外${es.excluded}問`));exams.append(row);}box.append(exams);
  const topics=el('div','panel');topics.append(el('h2','','分野ごとに振り返る'));for(const [id,t] of Object.entries(s.topics)){const row=el('div','progress-row');const top=el('div','progress-row-top');top.append(el('strong','',t.label),el('span','',`初見・自力 ${t.cleanCorrect}/${t.cleanAnswered}問正解`));row.append(top,el('p','quiet',`全${t.total}問 / 未解答${t.unanswered}問 / 復習候補${t.needsReview}問`));if(t.needsReview){const b=el('button','secondary','この分野の復習候補を解く');b.onclick=()=>{$('topic-filter').value=id;$('exam-filter').value='';$('year-filter').value='';$('mode-filter').value='retry';$('non-calculation').checked=false;$('validity-filter').value='current';showScreen('learn');startQueue(filteredQuestions(questions,store.history,filters()));};row.append(b);}topics.append(row);}box.append(topics);
  const b=el('button','primary','この記録をpiyoに共有する');b.onclick=()=>showScreen('share');box.append(b);
}
function renderShare(){$('summary-text').value=summaryText(store.history,questions,data.dataVersion);if(store.recoveryRaw&&!$('saved-recovery')){const b=el('button','secondary','復旧時に保護した元データを保存');b.id='saved-recovery';b.onclick=()=>download(`progress-denki-protected-${Date.now()}.txt`,store.recoveryRaw,'text/plain;charset=utf-8');$('export-status').after(b);}}
function renderSources(){const list=$('source-list');list.replaceChildren();for(const exam of data.exams){const item=el('div','source-item');item.append(el('h3','',labelExam(exam)));const links=el('div','source-links');links.append(sourceLink('問題の公式原本PDF ↗',exam.sourceUrl),sourceLink('公式解答PDF ↗（正答が表示されます）',exam.answerSourceUrl));item.append(links,el('p','small quiet',exam.attribution||'一般財団法人 電気技術者試験センター。原本から問題・選択肢・必要な共通図を切り出して収録。'));list.append(item);}list.append(el('p','small quiet',`アプリ ${APP_VERSION} / 問題データ ${data.dataVersion}`));}
async function load(){
  try{const response=await fetch('./data/exams.json',{cache:'no-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();if(!data.exams?.length)throw new Error('問題データが空です');questions=data.exams.flatMap(exam=>exam.questions.map(q=>({...q,examId:exam.id,year:exam.year,examTitle:labelExam(exam),contexts:exam.contexts||[],excluded:q.excluded===true||!['unchanged_verified','not_rule_dependent'].includes(q.lawAudit?.status)})));
    if(questions.some(q=>!q.id||!CHOICES.includes(q.answer)||!Array.isArray(q.images)||!q.images.length))throw new Error('問題データの形式が不正です');
    let local;try{local=window.localStorage;}catch{local={getItem(){throw new Error('blocked');}};}
    store=new HistoryStore(local,questions);refreshStatus();
    for(const year of [...new Set(data.exams.map(e=>e.year))]){const o=el('option','',`${year}年`);o.value=year;$('year-filter').append(o);}
    for(const exam of data.exams){const o=el('option','',labelExam(exam));o.value=exam.id;$('exam-filter').append(o);}const topics=new Map(questions.map(q=>[q.topic,q.topicLabel||q.topic]));for(const [id,title] of topics){const o=el('option','',title);o.value=id;$('topic-filter').append(o);}
    $('loading').hidden=true;$('learn-screen').hidden=false;renderQuestionList();refreshFilterCount();renderSources();
    wire();
  }catch(error){$('loading').textContent=`問題データを読み込めませんでした。接続を確認して再読み込みしてください。学習記録の上書きはしていません。(${error.message})`;}
}
function wire(){
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
  for(const id of ['year-filter','exam-filter','topic-filter','mode-filter','non-calculation','validity-filter'])$(id).onchange=refreshFilterCount;
  $('start').onclick=()=>startQueue(filteredQuestions(questions,store.history,filters()));
  $('grade').onclick=()=>{if(selected!==null)submit(selected);};$('skip').onclick=()=>submit(null);
  $('reveal').onclick=()=>{if(!answered)$('confirm-dialog').showModal();};$('cancel-reveal').onclick=()=>$('confirm-dialog').close();$('confirm-reveal').onclick=()=>{$('confirm-dialog').close();submit(null,{reveal:true});};
  $('known-checkbox').onchange=()=>{if($('known-checkbox').checked){append('prior-exposure');$('known-checkbox').disabled=true;}};
  $('help-checkbox').onchange=()=>{if($('help-checkbox').checked){append('help');$('help-checkbox').disabled=true;}};
  $('next').onclick=()=>{if(!answered)return;if(position+1<queue.length){position++;renderQuestion();}else{showScreen('progress');}};
  $('stop-session').onclick=()=>{$('session-area').hidden=true;current=null;refreshFilterCount();$('start').focus();};
  $('cancel-recovery').onclick=()=>$('recovery-dialog').close();$('confirm-recovery').onclick=()=>{$('recovery-dialog').close();store.recover(true);refreshStatus();if(screen==='share')renderShare();};
  $('close-image').onclick=()=>$('image-dialog').close();$('zoom-level').onchange=()=>{$('zoom-image').style.width=$('zoom-level').value==='native'?`${$('zoom-image').naturalWidth||1600}px`:`${Number($('zoom-level').value)*100}%`;};
  $('download-json').onclick=()=>download(name('json'),JSON.stringify(exportHistory(store.history,data.dataVersion,questions),null,2));
  $('download-text').onclick=()=>{renderShare();download(name('txt'),$('summary-text').value,'text/plain;charset=utf-8');};
  $('copy-summary').onclick=async()=>{renderShare();try{await navigator.clipboard.writeText($('summary-text').value);$('export-status').textContent='コピーしました。piyoとの私信チャットに貼り付けてください。';}catch{$('summary-text').closest('details').open=true;$('summary-text').focus();$('summary-text').select();$('export-status').textContent='自動コピーが使えませんでした。表示された文章を選択してコピーするか、TXTで保存してください。';}};
  $('import-file').onchange=async()=>{const readId=++importReadId;pendingImport=null;const file=$('import-file').files[0];const box=$('import-preview');box.replaceChildren();box.className='';if(!file)return;try{if(file.size>20*1024*1024)throw new Error('20MBを超えるファイルは取り込めません。');const fileText=await file.text();if(readId!==importReadId)return;const value=JSON.parse(fileText);const valid=validateHistory(value,questions);const p=previewMerge(store.history,valid);pendingImport=valid;box.append(el('h3','','取り込む前の確認'),el('p','',`新しく追加する記録：${p.added}件 / すでにある記録：${p.duplicates}件 / ファイル内の解答試行：${p.incomingAttempts}回`),el('p','small','今の履歴は消しません。同じIDの記録を重複させず、日時順に統合します。取り込み後も、初見・再挑戦は全記録をもとに判定します。'));if(!p.added){box.append(el('p','','新しい記録はありません。変更は不要です。'));return;}const buttons=el('div','button-row');const backup=el('button','secondary','取り込み前のJSONを保存');backup.onclick=()=>download(name('json'),JSON.stringify(exportHistory(store.history,data.dataVersion,questions),null,2));const confirm=el('button','primary',`${p.added}件を統合する`);confirm.onclick=()=>{if(!pendingImport)return;try{const result=store.merge(pendingImport);pendingImport=null;refreshStatus();renderShare();renderQuestionList();refreshFilterCount();box.replaceChildren(el('p','',`${result.added}件の記録を統合しました。${store.status!=='ok'?'ブラウザ保存は使えないため、閉じる前にJSONを保存してください。':''}`));$('import-file').value='';}catch(error){box.className='error';box.replaceChildren(el('p','',`取り込みを中止しました。${error.message} 元の履歴とファイルは変更していません。`));}};const cancel=el('button','secondary','取り込まない');cancel.onclick=()=>{pendingImport=null;box.replaceChildren();$('import-file').value='';};buttons.append(backup,confirm,cancel);box.append(buttons);}catch(error){if(readId!==importReadId)return;box.className='error';box.append(el('p','',`取り込みを中止しました。${error.message} 元の履歴とファイルは変更していません。`));}};
  window.addEventListener('storage',()=>{store.refresh();refreshStatus();if(screen==='progress')renderProgress();if(screen==='share')renderShare();renderQuestionList();refreshFilterCount();});
}
load();
