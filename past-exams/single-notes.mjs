import {saveQuestionNote,latestQuestionNotes} from './core.mjs?v=1.8.9';
const trimNote=value=>[...String(value)].slice(0,200).join('');
// Keep drafts in the ordinary event log: an ungraded memo is never an answer attempt.
export function createSingleQuestionNotes({document,store,onHistory=()=>{}}){
  let current=null,before=null,after=null,timer=null;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function save(editor,force=false){
    if(!editor||editor.frozen||(editor.composing&&!force))return;
    const note=trimNote(editor.input.value);editor.input.value=note;
    editor.count.textContent=`${[...note].length} / 200字`;
    if(note===editor.saved)return;
    try{saveQuestionNote(store,editor.q,editor.context,note,{phase:editor.phase,...(editor.attempt?{relatedAttemptId:editor.attempt.id}:{})});editor.saved=note;editor.status.textContent=store.status==='ok'?'メモを保存しました。':'この画面内に保存しました。閉じる前にJSONを保存してください。';onHistory();}
    catch(error){editor.status.textContent=`メモを保存できませんでした。内容をコピーして保管してください。${error.message}`;}
  }
  function flush(){if(timer!==null){clearTimeout(timer);timer=null;}save(before,true);save(after,true);}
  function editor(root,q,context,phase,value='',attempt=null){
    const box=el('section');box.className='single-note-editor';
    const label=el('label',phase==='before-answer'?'解くときのメモ（200字まで）':'採点後の疑問・追記（200字まで）');
    const input=el('textarea');input.id=phase==='before-answer'?'single-note-before':'single-note-after';label.setAttribute('for',input.id);input.rows=3;input.value=value;
    input.placeholder=phase==='before-answer'?'迷っている点、知らないことなど':'解説を読んでも残った疑問など';
    const help=el('p',phase==='before-answer'?'自動保存。未採点でもAI共有の対象になります。採点時の内容は解答記録に残ります。':'自動保存。解答時のメモは書き換えず、採点後の追記として残します。');help.className='small quiet';
    const count=el('span',`${[...value].length} / 200字`),status=el('span','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const meta=el('p');meta.className='small quiet';meta.append(count,el('span','　'),status);
    const out={input,count,status,phase,q,context,attempt,saved:value,composing:false};
    const changed=()=>{if(out.composing)return;input.value=trimNote(input.value);count.textContent=`${[...input.value].length} / 200字`;status.textContent='保存待ち…';if(timer!==null)clearTimeout(timer);timer=setTimeout(()=>{timer=null;save(out);},350);};
    input.oninput=changed;input.onchange=()=>save(out);input.onblur=()=>save(out);input.oncompositionstart=()=>{out.composing=true;};input.oncompositionend=()=>{out.composing=false;changed();save(out);};
    box.append(label,input,help,meta);root.append(box);return out;
  }
  function mount(root,q,context){
    flush();current={q,context};before=null;after=null;root.replaceChildren();
    const notes=latestQuestionNotes(store.history,q.id),attempts=store.history.events.filter(e=>e.type==='attempt'&&e.questionId===q.id);
    const latest=notes.filter(e=>e.notePhase==='before-answer').at(-1);
    const draft=latest&&!attempts.some(a=>a.visitId===latest.visitId)?latest:null;
    const draftContext=draft?.note?{...context,visitId:draft.visitId,sessionId:draft.sessionId}:context;
    before=editor(root,q,draftContext,'before-answer',draft?.note||'');
    if(draft?.note)before.status.textContent='未採点のメモを復元しました。';
    const historical=[...notes.filter(e=>e.note&&e!==draft),...attempts.filter(e=>e.note)].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
    if(historical.length){const details=el('details');details.className='single-note-history';details.append(el('summary',`この問題の保存済みメモ（${historical.length}件）`));for(const e of historical){const p=el('p',`${e.occurredAt} ${e.type==='attempt'?'解答時':e.notePhase==='after-answer'?'採点後':'解答前'}：${e.note}`);p.className='note-text';details.append(p);}root.append(details);}
  }
  function snapshot(){flush();return trimNote(before?.input.value||'');}
  function graded(root,attempt){flush();if(before){if(before.input.value){try{saveQuestionNote(store,before.q,before.context,'',{phase:'before-answer'});onHistory();}catch(error){before.status.textContent=error.message;}}before.frozen=true;before.input.readOnly=true;before.status.textContent='採点時のメモとして確定しました。';}after=editor(root,current.q,current.context,'after-answer','',attempt);}
  function stop(){flush();before=null;after=null;current=null;}
  return {mount,snapshot,graded,flush,stop};
}
