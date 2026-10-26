import {createKnowledgeLoader as legacyLoader,createKnowledgeSection as legacySection} from './knowledge.mjs?v=1.5.0';
import {isPilotQuestion} from './pilot-scope.mjs?v=1.5.0';

// The published schema1 loader remains wholly independent from the pilot loader.
export function createKnowledgeLoader({fetcher,questions,dataVersion,importBeginner=()=>import('./knowledge-beginner.mjs?v=1.8.7')}) {
  const legacy=legacyLoader({fetcher,questions,dataVersion});
  let pendingModule=null,beginner=null;
  return {legacy,async beginner(){
    if(!pendingModule)pendingModule=Promise.resolve().then(importBeginner).catch(error=>{pendingModule=null;throw error;});
    const module=await pendingModule;
    if(!beginner)beginner=module.createKnowledgeLoader({fetcher,questions:questions.filter(q=>isPilotQuestion(q.id)),dataVersion,evidenceQuestions:questions});
    return {module,loadKnowledge:beginner};
  }};
}

export function createKnowledgeSection({document,question,loadKnowledge}) {
  if(!isPilotQuestion(question.id))return legacySection({document,question,loadKnowledge:loadKnowledge.legacy});
  const section=document.createElement('details');section.className='knowledge-section knowledge-beginner';section.dataset.questionId=question.id;
  const summary=document.createElement('summary');summary.textContent='ついでに覚えよう';
  const hint=document.createElement('span');hint.textContent='試験で使う基本を、短く整理';summary.append(hint);
  const status=document.createElement('p');status.className='small quiet';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const body=document.createElement('div');body.className='knowledge-body';section.append(summary,status,body);
  let state='idle';
  async function initialize(){
    if(state==='loading'||state==='ready')return;
    state='loading';status.textContent='関連する学習資料を読み込んでいます。';body.replaceChildren();
    try{
      const loaded=await loadKnowledge.beginner();
      if(!section.isConnected){state='idle';return;}
      const restoreFocus=document.activeElement===summary;
      loaded.module.createKnowledgeSection({document,question,loadKnowledge:loaded.loadKnowledge,existingSection:section});state='ready';
      if(restoreFocus)section.childNodes[0].focus();
    }catch{
      if(!section.isConnected){state='idle';return;}
      state='error';status.textContent='新しい補足を読み込めませんでした。採点・学習記録はそのままです。';body.replaceChildren();
      const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='補足をもう一度読み込む';retry.onclick=()=>{summary.focus();initialize();};body.append(retry);
    }
  }
  section.addEventListener('toggle',()=>{if(section.open)initialize();});return section;
}
