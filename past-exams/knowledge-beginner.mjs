import {isPilotQuestion,PILOT_IDS} from './pilot-scope.mjs?v=1.5.0';
// Reviewed beginner renderer for all published 2017–2026 papers, loaded after answering and opening its section.
export const EXPECTED_BASE_SHA256 = '378a9bd59bcf8bb9890a49e0c2cc64aa59eb204bb7da7b531998c44659f6e9eb';
const DOMAINS = new Set(['theory','design','equipment','construction','inspection','diagram','law']);
const SHA = /^[a-f0-9]{64}$/;
const ID = /^(theory|design|equipment|construction|inspection|diagram|law)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const plainObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const keys = (value,allowed) => { assert(plainObject(value) && Object.keys(value).every(k=>allowed.includes(k)), '追加資料に未対応の項目が含まれています。'); };
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 12000;
const texts = (x,min=1) => Array.isArray(x) && x.length >= min && x.length <= 80 && x.every(text);
const date = x => { try { return typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x) && new Date(x+'T00:00:00Z').toISOString().slice(0,10) === x; } catch { return false; } };
const https = x => { try { return typeof x === 'string' && new URL(x).protocol === 'https:'; } catch { return false; } };

export function validateKnowledge(value, questions, dataVersion, evidenceQuestions=questions) {
  assert(plainObject(value) && value.format === 'denki-post-answer-knowledge' && value.schemaVersion === 2, '追加資料の形式が未対応です。');
  keys(value,['format','schemaVersion','knowledgeVersion','baseDataVersion','baseDataSha256','cardCount','questionCount','reviews','cards','questionLinks','editorialCorrections']);
  assert(text(value.knowledgeVersion) && value.knowledgeVersion.length <= 100 && value.baseDataVersion === dataVersion, '追加資料と問題データの版が一致しません。');
  assert(value.baseDataSha256 === EXPECTED_BASE_SHA256, '追加資料の原本情報が不足しています。');
  assert(plainObject(value.cards) && plainObject(value.questionLinks), '追加資料の内容が不足しています。');
  const ids = new Set(questions.map(q=>q.id));
  assert(ids.size===PILOT_IDS.length && [...ids].every(isPilotQuestion), '公開済み資料の対象外の問題が含まれています。');
  assert(ids.size === questions.length && Object.keys(value.questionLinks).length === ids.size, '追加資料の問題対応が不完全です。');
  assert(Array.isArray(value.reviews) && value.reviews.length > 0 && value.reviews.every(r => plainObject(r) && r.status === 'verified' && r.pedagogyVersion === 'beginner-v2' && SHA.test(r.contentSha256) && SHA.test(r.reportSha256) && SHA.test(r.reviewerFingerprintSha256)), '追加資料の確認情報が不足しています。');
  for(const review of value.reviews) keys(review,['status','pedagogyVersion','contentSha256','reportSha256','reviewerFingerprintSha256']);
  for (const [id,card] of Object.entries(value.cards)) {
    assert(ID.test(id) && plainObject(card) && card.id === id && DOMAINS.has(card.domain) && id.startsWith(card.domain+'-'), '追加カードの識別情報が不正です。');
    keys(card,['id','domain','title','firstPrinciple','examUse','essentialConditions','comparison','memoryAid','details','sources','examEvidenceIds']);
    for (const key of ['title','firstPrinciple','examUse']) assert(text(card[key]), '追加カードの基本・試験での使い方が不足しています。');
    assert(texts(card.essentialConditions,0) && card.essentialConditions.length <= 2, '追加カードの適用条件が不正です。');
    if(card.memoryAid !== undefined) assert(text(card.memoryAid), '覚え方の内容が不正です。');
    assert(Array.isArray(card.examEvidenceIds) && card.examEvidenceIds.length >= 1 && card.examEvidenceIds.length <= 8 && card.examEvidenceIds.every(id=>evidenceQuestions.some(q=>q.id===id)) && new Set(card.examEvidenceIds).size === card.examEvidenceIds.length, '試験との関連を確認する問題IDが不正です。');
    assert(Array.isArray(card.sources) && card.sources.length > 0 && card.sources.every(s=>plainObject(s) && ['id','title','locator','supports'].every(k=>text(s[k])) && https(s.url) && date(s.checkedAt)), '追加カードの出典が不足しています。');
    for(const source of card.sources) keys(source,['id','title','url','locator','checkedAt','supports']);
    assert(new Set(card.sources.map(s=>s.id)).size === card.sources.length, '追加カードの出典IDが重複しています。');
    if (card.comparison !== undefined) {
      const t = card.comparison;keys(t,['caption','columns','rows','notes']);
      assert(plainObject(t) && text(t.caption) && texts(t.columns,2) && t.columns.length <= 4 && Array.isArray(t.rows) && t.rows.length >= 2 && t.rows.length <= 5 && t.rows.every(row=>texts(row,2) && row.length === t.columns.length) && texts(t.notes,0), '比較表の行・列・条件が不正です。');
    }
    if (card.details !== undefined) {
      assert(Array.isArray(card.details) && card.details.length <= 3, '追加の詳しい説明が不正です。');
      for(const detail of card.details){keys(detail,['title','body']);assert(text(detail.title) && text(detail.body), '追加の詳しい説明が不完全です。');}
    }
  }
  if(value.editorialCorrections!==undefined){
    assert(Array.isArray(value.editorialCorrections)&&value.editorialCorrections.length<=20,'補足の更新記録が不正です。');
    for(const proof of value.editorialCorrections){
      keys(proof,['status','checkedAt','scope','beforeKnowledgeSha256','contentSha256','reportSha256','reviewerFingerprintSha256','changes']);
      assert(proof.status==='verified'&&date(proof.checkedAt)&&text(proof.scope)&&['beforeKnowledgeSha256','contentSha256','reportSha256','reviewerFingerprintSha256'].every(k=>SHA.test(proof[k])),'補足の更新確認が不足しています。');
      assert(Array.isArray(proof.changes)&&proof.changes.length<=500,'補足の更新範囲が不正です。');
      for(const c of proof.changes){
        keys(c,['kind','id','path','beforeSha256','afterSha256','sources']);
        assert(['card','connection'].includes(c.kind)&&Object.hasOwn(c.kind==='card'?value.cards:value.questionLinks,c.id)&&Array.isArray(c.path)&&c.path.length>0&&c.path.every(k=>(typeof k==='string'||Number.isInteger(k))&&!['__proto__','prototype','constructor'].includes(k))&&SHA.test(c.beforeSha256)&&SHA.test(c.afterSha256),'補足の変更対象が不正です。');
        assert(Array.isArray(c.sources)&&c.sources.length>0&&c.sources.length<=20,'補足の変更出典が不足しています。');
        for(const source of c.sources){keys(source,['title','url','locator']);assert(text(source.title)&&https(source.url)&&text(source.locator),'補足の変更出典が不正です。');}
      }
    }
  }
  const used = new Set();
  for (const [id,links] of Object.entries(value.questionLinks)) {
    assert(ids.has(id) && Array.isArray(links) && links.length >= 1 && links.length <= 2, '追加資料の問題対応が不正です。');
    const seen = new Set();
    for (const link of links) {
      assert(plainObject(link) && Object.hasOwn(value.cards,link.cardId) && text(link.connection) && !seen.has(link.cardId), '追加資料の関連づけが不完全です。');
      keys(link,['cardId','connection']);
      seen.add(link.cardId);used.add(link.cardId);
    }
  }
  assert(used.size === Object.keys(value.cards).length && value.cardCount === used.size && value.questionCount === ids.size, '追加資料の件数が一致しません。');
  assert(!/\/workspace\/|\/root\/|file:\/\//i.test(JSON.stringify(value)), '追加資料に公開用ではない情報があります。');
  return value;
}

export function createKnowledgeLoader({fetcher,questions,dataVersion,evidenceQuestions=questions}) {
  let pending = null;
  return () => {
    if (!pending) pending = (async()=>{
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),20000);
      try {
        const response = await fetcher('./data/knowledge-beginner.json',{cache:'no-cache',signal:controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validateKnowledge(await response.json(),questions,dataVersion,evidenceQuestions);
      } finally { clearTimeout(timer); }
    })().catch(error=>{pending=null;throw error;});
    return pending;
  };
}


let symbolModulePromise=null;
function loadSymbolModule(){if(!symbolModulePromise)symbolModulePromise=import('./inline-symbols.mjs?v=1.8.7').catch(error=>{symbolModulePromise=null;throw error;});return symbolModulePromise;}
function enhanceSymbolTargets(document,container,targets,importSymbols=loadSymbolModule){
  let notice=null;
  const run=()=>{if(notice)notice.remove();notice=null;importSymbols().then(module=>{if(container.isConnected)module.enhanceTargets(container,targets);}).catch(()=>{
    if(!container.isConnected)return;
    notice=document.createElement('div');notice.className='symbol-load-note';const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent='図記号を読み込めませんでした。文章・採点・学習記録はそのまま使えます。';const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='図記号をもう一度読み込む';retry.onclick=()=>{container.tabIndex=-1;container.focus();run();};notice.append(message,retry);container.append(notice);
  });};run();
}

export function createKnowledgeSection({document,question,loadKnowledge,existingSection,importSymbols=loadSymbolModule}) {
  const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const list=(values,cls)=>{const ul=el('ul',cls);for(const x of values)ul.append(el('li','',x));return ul;};
  const section=existingSection||el('details');section.className='knowledge-section knowledge-beginner';section.replaceChildren();
  section.dataset.questionId=question.id;
  const summary=el('summary','','ついでに覚えよう');
  summary.append(el('span','','試験で使う基本を、短く整理'));
  const status=el('p','small quiet');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const body=el('div','knowledge-body');section.append(summary,status,body);
  let state='idle';
  async function render() {
    if(state==='loading'||state==='ready')return;
    state='loading';status.textContent='関連する学習資料を読み込んでいます。';body.replaceChildren();
    try {
      const value=await loadKnowledge();
      // A result from an old question never reaches the replacement question.
      if (!section.isConnected) {state='idle';return;}
      const links=value.questionLinks[question.id];
      if(!links?.length)throw new Error('この問題の追加資料が見つかりません。');
      body.replaceChildren();
      if(question.excluded)body.append(el('p','knowledge-caution','⚠ 元の問題は現行基準の通常練習対象外です。今のルールと当時の出題条件を分けて確認してください。'));
      function renderCard(link) {
        const card=value.cards[link.cardId];const article=el('article','knowledge-card');const targets=[];
        const cel=(tag,cls,text,path)=>{const node=el(tag,cls,text);targets.push({node,text,kind:'card',id:card.id,path});return node;};
        const clist=(values,cls,path)=>{const ul=el('ul',cls);values.forEach((text,i)=>ul.append(cel('li','',text,[...path,i])));return ul;};
        const connection=el('p','knowledge-connection',link.connection);targets.push({node:connection,text:link.connection,kind:'connection',id:question.id,path:[links.indexOf(link),'connection']});article.append(cel('h4','',card.title,['title']),connection);
        article.append(el('h5','','まず覚えること'),cel('p','knowledge-principle',card.firstPrinciple,['firstPrinciple']));
        article.append(el('h5','','試験ではここが問われる'),cel('p','knowledge-exam-use',card.examUse,['examUse']));
        if(card.essentialConditions.length)article.append(clist(card.essentialConditions,'knowledge-essential-conditions',['essentialConditions']));
        if(card.comparison){
          const t=card.comparison;
          const wrap=el('div','knowledge-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',t.caption+'（横にスクロールできます）');
          const table=el('table');table.append(cel('caption','',t.caption,['comparison','caption']));const head=el('thead'),hr=el('tr');
          for(const [i,label] of t.columns.entries()){const th=cel('th','',label,['comparison','columns',i]);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
          const rows=el('tbody');for(const [ri,row] of t.rows.entries()){const tr=el('tr');row.forEach((value,index)=>{const cell=cel(index?'td':'th','',value,['comparison','rows',ri,index]);if(!index)cell.scope='row';tr.append(cell);});rows.append(tr);}table.append(rows);wrap.append(table);article.append(wrap);
          if(t.notes.length)article.append(clist(t.notes,'small knowledge-table-notes',['comparison','notes']));
        }
        if(card.memoryAid)article.append(el('h5','','覚え方のコツ'),cel('p','knowledge-memory',card.memoryAid,['memoryAid']));
        if(card.details?.length){
          const details=el('details','knowledge-details');details.append(el('summary','','もう少し詳しく（任意）'));
          for(const [i,detail] of card.details.entries())details.append(cel('h5','',detail.title,['details',i,'title']),cel('p','',detail.body,['details',i,'body']));article.append(details);
        }
        const sources=el('details','knowledge-sources');sources.append(el('summary','','出典・確認日'));const ul=el('ul');
        for(const source of card.sources){const li=el('li');const a=el('a','',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,el('p','small',`${source.locator} ／ 確認日：${source.checkedAt}`),el('p','small quiet',source.supports));ul.append(li);}const updates=(value.editorialCorrections||[]).flatMap(p=>p.changes.filter(c=>c.kind==='card'?c.id===card.id:c.id===question.id).flatMap(c=>c.sources));
        if(updates.length){ul.append(el('li','small quiet','今回の意味・表記の補足で確認した資料（以前の確認記録は履歴として保持）'));for(const source of updates){const li=el('li'),a=el('a','',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,el('p','small',source.locator));ul.append(li);}}
        sources.append(ul);article.append(sources);
        enhanceSymbolTargets(document,article,targets,importSymbols);return article;
      }
      body.append(renderCard(links[0]));
      // A second, distinct exam target is optional rather than another wall of text.
      if(links.length>1){
        const more=el('details','knowledge-related');more.append(el('summary','',`関連して覚える：${value.cards[links[1].cardId].title}`));
        let rendered=false;more.addEventListener('toggle',()=>{if(more.open&&!rendered){more.append(renderCard(links[1]));rendered=true;}});body.append(more);
      }
      body.append(el('p','small quiet',`piyoが作成した学習用の補足です。採点結果は変わりません。補足データ：${value.knowledgeVersion}`));state='ready';status.textContent='学習メモを表示しました。';
    }catch{
      if(!section.isConnected){state='idle';return;}
      state='error';status.textContent='補足を読み込めませんでした。採点・学習記録はそのままです。';body.replaceChildren();
      const retry=el('button','secondary','補足をもう一度読み込む');retry.type='button';retry.onclick=()=>{summary.focus();render();};body.append(retry);
    }
  }
  section.addEventListener('toggle',()=>{if(section.open)render();});
  if(section.open)render();
  return section;
}
