// Supplemental learning is deliberately independent of answer/history state.
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

export function validateKnowledge(value, questions, dataVersion) {
  assert(plainObject(value) && value.format === 'denki-post-answer-knowledge' && value.schemaVersion === 1, '追加資料の形式が未対応です。');
  keys(value,['format','schemaVersion','knowledgeVersion','baseDataVersion','baseDataSha256','cardCount','questionCount','reviews','cards','questionLinks']);
  assert(text(value.knowledgeVersion) && value.knowledgeVersion.length <= 100 && value.baseDataVersion === dataVersion, '追加資料と問題データの版が一致しません。');
  assert(value.baseDataSha256 === EXPECTED_BASE_SHA256, '追加資料の原本情報が不足しています。');
  assert(plainObject(value.cards) && plainObject(value.questionLinks), '追加資料の内容が不足しています。');
  const ids = new Set(questions.map(q=>q.id));
  assert(ids.size === questions.length && Object.keys(value.questionLinks).length === ids.size, '追加資料の問題対応が不完全です。');
  assert(Array.isArray(value.reviews) && value.reviews.length > 0 && value.reviews.every(r => plainObject(r) && r.status === 'verified' && SHA.test(r.contentSha256) && SHA.test(r.reportSha256) && SHA.test(r.reviewerFingerprintSha256)), '追加資料の確認情報が不足しています。');
  for(const review of value.reviews) keys(review,['status','contentSha256','reportSha256','reviewerFingerprintSha256']);
  for (const [id,card] of Object.entries(value.cards)) {
    assert(ID.test(id) && plainObject(card) && card.id === id && DOMAINS.has(card.domain) && id.startsWith(card.domain+'-'), '追加カードの識別情報が不正です。');
    keys(card,['id','domain','title','goal','conditions','keyPoints','table','memoryAid','boundaryNotes','check','sources']);
    for (const key of ['title','goal','memoryAid']) assert(text(card[key]), '追加カードの説明が不足しています。');
    for (const key of ['conditions','keyPoints','boundaryNotes']) assert(texts(card[key]), '追加カードの条件・要点が不足しています。');
    assert(Array.isArray(card.sources) && card.sources.length > 0 && card.sources.every(s=>plainObject(s) && ['id','title','locator','supports'].every(k=>text(s[k])) && https(s.url) && date(s.checkedAt)), '追加カードの出典が不足しています。');
    for(const source of card.sources) keys(source,['id','title','url','locator','checkedAt','supports']);
    assert(new Set(card.sources.map(s=>s.id)).size === card.sources.length, '追加カードの出典IDが重複しています。');
    if (card.table !== undefined) {
      const t = card.table;keys(t,['caption','columns','rows','notes']);
      assert(plainObject(t) && text(t.caption) && texts(t.columns,2) && t.columns.length <= 12 && Array.isArray(t.rows) && t.rows.length >= 2 && t.rows.length <= 100 && t.rows.every(row=>texts(row,2) && row.length === t.columns.length) && texts(t.notes,0), '比較表の行・列・条件が不正です。');
    }
    if (card.check !== undefined) {keys(card.check,['prompt','answer']);assert(plainObject(card.check) && text(card.check.prompt) && text(card.check.answer), '追加の確認問題が不完全です。');}
  }
  const used = new Set();
  for (const [id,links] of Object.entries(value.questionLinks)) {
    assert(ids.has(id) && Array.isArray(links) && links.length >= 1 && links.length <= 3, '追加資料の問題対応が不正です。');
    const seen = new Set();
    for (const link of links) {
      assert(plainObject(link) && Object.hasOwn(value.cards,link.cardId) && text(link.relevance) && text(link.extension) && !seen.has(link.cardId), '追加資料の関連づけが不完全です。');
      keys(link,['cardId','relevance','extension']);
      seen.add(link.cardId);used.add(link.cardId);
    }
  }
  assert(used.size === Object.keys(value.cards).length && value.cardCount === used.size && value.questionCount === ids.size, '追加資料の件数が一致しません。');
  assert(!/\/workspace\/|\/root\/|file:\/\//i.test(JSON.stringify(value)), '追加資料に公開用ではない情報があります。');
  return value;
}

export function createKnowledgeLoader({fetcher,questions,dataVersion}) {
  let pending = null;
  return () => {
    if (!pending) pending = (async()=>{
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),20000);
      try {
        const response = await fetcher('./data/knowledge.json',{cache:'no-cache',signal:controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validateKnowledge(await response.json(),questions,dataVersion);
      } finally { clearTimeout(timer); }
    })().catch(error=>{pending=null;throw error;});
    return pending;
  };
}

export function createKnowledgeSection({document,question,loadKnowledge}) {
  const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const list=(values,cls)=>{const ul=el('ul',cls);for(const x of values)ul.append(el('li','',x));return ul;};
  const section=el('details','knowledge-section');
  section.dataset.questionId=question.id;
  const summary=el('summary','','ついでに覚えよう');
  summary.append(el('span','','条件を変えたときの見方・比較'));
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
      body.replaceChildren(el('p','small quiet','piyoが作成した学習用の補足です。読むかどうかは自由。今回の採点結果は変わりません。'));
      if(question.excluded)body.append(el('p','knowledge-caution','⚠ 元の問題は現行基準の通常練習対象外です。補足の適用条件と確認日を読み、当時の出題条件と区別してください。'));
      for(const link of links){
        const card=value.cards[link.cardId];const article=el('article','knowledge-card');
        article.append(el('h4','',card.title),el('p','knowledge-relevance',link.relevance),el('p','knowledge-extension',`広げるポイント：${link.extension}`),el('p','knowledge-goal',card.goal));
        article.append(el('h5','','この知識を使える条件'),list(card.conditions,'knowledge-conditions'));
        article.append(list(card.keyPoints,'knowledge-points'));
        if(card.table){
          const wrap=el('div','knowledge-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',card.table.caption+'（横にスクロールできます）');
          const table=el('table');table.append(el('caption','',card.table.caption));const head=el('thead'),hr=el('tr');
          for(const label of card.table.columns){const th=el('th','',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
          const rows=el('tbody');for(const row of card.table.rows){const tr=el('tr');row.forEach((value,index)=>{const cell=el(index?'td':'th','',value);if(!index)cell.scope='row';tr.append(cell);});rows.append(tr);}table.append(rows);wrap.append(table);article.append(wrap,list(card.table.notes,'small knowledge-table-notes'));
        }
        article.append(el('h5','','覚え方・考え方のコツ'),el('p','knowledge-memory',card.memoryAid),el('h5','','混同しないために'),list(card.boundaryNotes,'knowledge-boundaries'));
        if(card.check){const check=el('details','knowledge-check');check.append(el('summary','','少し条件を変えて考える（任意）'),el('p','',card.check.prompt));const answer=el('details');answer.append(el('summary','','考え方を見る'),el('p','',card.check.answer));check.append(answer);article.append(check);}
        const sources=el('details','knowledge-sources');sources.append(el('summary','','補足の出典・確認日'));const ul=el('ul');
        for(const source of card.sources){const li=el('li');const a=el('a','',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,el('p','small',`${source.locator} ／ 確認日：${source.checkedAt}`),el('p','small quiet',source.supports));ul.append(li);}sources.append(ul);article.append(sources);body.append(article);
      }
      body.append(el('p','small quiet',`補足データ：${value.knowledgeVersion}`));state='ready';status.textContent=`${links.length}件の補足を表示しました。`;
    }catch{
      if(!section.isConnected){state='idle';return;}
      state='error';status.textContent='補足を読み込めませんでした。採点・学習記録はそのままです。';body.replaceChildren();
      const retry=el('button','secondary','補足をもう一度読み込む');retry.type='button';retry.onclick=()=>{summary.focus();render();};body.append(retry);
    }
  }
  section.addEventListener('toggle',()=>{if(section.open)render();});
  return section;
}
