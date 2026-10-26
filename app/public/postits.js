/* ALPHA 0.18.0 — Post-it PC, sauvegardés dans SQLite.
   Phase 1 : texte, couleur, forme, archivage et édition automatique.
   Les pièces jointes et les notes intelligentes seront des phases séparées. */
const POSTIT_PALETTE=[
  ['gold','Doré doux'],['sage','Vert sauge'],['pink','Rose poudré'],
  ['mauve','Mauve'],['blue','Bleu grisé'],['red','Rouge doux'],
  ['peach','Pêche'],['cream','Crème'],['deep-blue','Bleu ardoise'],
  ['deep-green','Vert forêt']
];
const POSTIT_COLORS=new Set(POSTIT_PALETTE.map(entry=>entry[0]));
const POSTIT_SHAPES=new Set(['square','rounded','pill']);
function postitValidStyle(note){
  return {color:POSTIT_COLORS.has(note.color)?note.color:'gold',
    shape:POSTIT_SHAPES.has(note.shape)?note.shape:'rounded'};
}
function postitSafeLinks(node,content){
  // Contenu plain-text par défaut : aucun HTML personnel n'est interprété.
  const pattern=/https?:\/\/[^\s<>"']+/g;
  let start=0,match;
  while((match=pattern.exec(content))){
    if(match.index>start)node.appendChild(document.createTextNode(content.slice(start,match.index)));
    const link=document.createElement('a');
    link.href=match[0];link.textContent=match[0];link.rel='noopener noreferrer';
    link.target='_blank';link.title='Ouvrir le lien dans un autre onglet';
    node.appendChild(link);
    start=match.index+match[0].length;
  }
  if(start<content.length)node.appendChild(document.createTextNode(content.slice(start)));
}
function renderHomePostits(){
  const root=$('#homePostitList');if(!root)return;
  root.innerHTML='';
  const notes=Array.isArray(state.postits)?state.postits:[];
  if(!notes.length){
    const empty=document.createElement('p');empty.className='postit-empty';
    empty.textContent='Aucun Post-it visible. Clique sur ＋ Post-it pour en créer un.';
    root.appendChild(empty);
  }
  for(const note of notes){
    const style=postitValidStyle(note),card=document.createElement('article');
    card.className='home-postit postit-'+style.color+' postit-'+style.shape;
    card.dataset.postitId=String(note.id);
    const head=document.createElement('div');head.className='postit-card-head';
    const title=document.createElement('strong');title.className='postit-title';title.textContent=note.title;
    const edit=document.createElement('button');edit.type='button';edit.className='postit-card-edit';
    edit.textContent='✎';edit.title='Modifier le Post-it '+note.title;
    edit.setAttribute('aria-label','Modifier le Post-it '+note.title);
    edit.onclick=()=>openPostitEditor(note.id);
    head.append(title,edit);
    const text=document.createElement('div');text.className='postit-card-body';
    if(note.body.trim())postitSafeLinks(text,note.body);
    else text.textContent='Clique pour écrire…';
    const open=document.createElement('button');open.type='button';open.className='postit-card-open';
    open.setAttribute('aria-label','Écrire dans '+note.title);
    open.textContent='Modifier';
    open.onclick=()=>openPostitEditor(note.id);
    card.append(head,text,open);root.appendChild(card);
  }
  if(typeof requestHomeCanvasMeasure==='function')requestHomeCanvasMeasure();
}
function openPostitEditor(id){
  const note=state.postits.find(x=>x.id===id);if(!note)return;
  if(typeof globalLayoutEditing!=='undefined'&&globalLayoutEditing){
    showUiError(new Error('Termine d’abord le déplacement des modules.'),'Édition du Post-it');return;
  }
  const style=postitValidStyle(note);
  const colors=POSTIT_PALETTE.map(([value,label])=>
    '<option value="'+value+'" '+(style.color===value?'selected':'')+'>'+label+'</option>').join('');
  openModal('<div class="postit-editor"><h2>✎ '+esc(note.title)+'</h2>'+
    '<p class="muted">Tout est enregistré automatiquement dans les données de L’Atelier.</p>'+
    '<form id="postitEditForm">'+
    '<label>Titre<input name="title" maxlength="120" required value="'+esc(note.title)+'"></label>'+
    '<label>Texte<textarea name="body" rows="8" maxlength="20000" placeholder="Tes idées, notes ou liens…"></textarea></label>'+
    '<div class="postit-editor-options">'+
    '<label>Couleur<select name="color">'+colors+'</select></label>'+
    '<label>Forme<select name="shape"><option value="rounded">Coins arrondis</option><option value="square">Carré</option><option value="pill">Très arrondi</option></select></label></div>'+
    '<div id="postitSaveStatus" class="muted postit-save-status" role="status">Enregistré</div>'+
    '<div class="form-actions"><button type="button" id="postitArchive" class="secondary">Archiver</button>'+
    '<button type="button" id="postitEditorClose" class="primary">Fermer</button></div>'+
    '</form></div>');
  const form=$('#postitEditForm'),status=$('#postitSaveStatus');
  form.elements.body.value=note.body;form.elements.shape.value=style.shape;
  let timer=null,lastPromise=Promise.resolve();
  let revision=0;
  function snapshot(){return {
    title:form.elements.title.value.trim()||'Sans titre',
    body:form.elements.body.value,
    color:form.elements.color.value,shape:form.elements.shape.value
  }}
  function persist(){
    if(timer){clearTimeout(timer);timer=null}
    const values=snapshot(),run=++revision;
    status.textContent='Enregistrement…';
    lastPromise=lastPromise.catch(()=>{}).then(async()=>{
      await api('/api/postits/'+id,{method:'PUT',body:JSON.stringify(values)});
      const original=state.postits.find(p=>p.id===id);
      if(original)Object.assign(original,values);
      renderHomePostits();
      if(run===revision&&document.contains(status))status.textContent='Enregistré';
    }).catch(error=>{
      if(document.contains(status))status.textContent='⚠ Enregistrement impossible : '+error.message;
      showUiError(error,'Sauvegarde du Post-it');
      throw error;
    });
    return lastPromise;
  }
  const schedule=()=>{
    if(timer)clearTimeout(timer);
    status.textContent='Modification non encore enregistrée…';
    timer=setTimeout(()=>{persist().catch(()=>{})},450);
  };
  form.addEventListener('input',schedule);
  form.addEventListener('change',schedule);
  form.onsubmit=event=>event.preventDefault();
  $('#postitEditorClose').onclick=()=>{
    persist().then(closeModal).catch(()=>{});
  };
  $('#postitArchive').onclick=async()=>{
    const answer=await askUiConfirm('Archiver ce Post-it',
      '« '+note.title+' » restera accessible dans les archives des Post-it.',
      'Archiver');
    if(!answer)return;
    try{
      await persist();
      await api('/api/postits/'+id,{method:'PUT',body:JSON.stringify({archived:true})});
      state.postits=state.postits.filter(x=>x.id!==id);
      closeModal();renderHomePostits();
    }catch(error){showUiError(error,'Impossible d’archiver le Post-it')}
  };
}
async function addHomePostit(){
  if(typeof globalLayoutEditing!=='undefined'&&globalLayoutEditing){
    showUiError(new Error('Clique sur Terminer avant de créer une note.'),'Nouveau Post-it');return;
  }
  try{
    const created=await api('/api/postits',{method:'POST',
      body:JSON.stringify({title:'Nouveau Post-it',body:'',color:'gold',shape:'rounded'})});
    await reloadHomePostits();
    openPostitEditor(created.id);
  }catch(error){showUiError(error,'Impossible de créer le Post-it')}
}
async function reloadHomePostits(){
  state.postits=await api('/api/postits');
  renderHomePostits();
}
async function openPostitArchives(){
  try{
    const entries=await api('/api/postits?archived=1');
    openModal('<h2>Archives des Post-it</h2><p class="muted">Les notes archivées ne sont jamais supprimées automatiquement.</p>'+
      '<div id="postitArchivesList"></div><div class="form-actions">'+
      '<button type="button" id="postitArchiveClose">Fermer</button></div>');
    const root=$('#postitArchivesList');
    if(!entries.length)root.textContent='Aucun Post-it archivé.';
    for(const note of entries){
      const line=document.createElement('div');line.className='postit-archive-row';
      const title=document.createElement('span');title.textContent=note.title;
      const restore=document.createElement('button');restore.type='button';
      restore.textContent='Restaurer';restore.onclick=async()=>{
        restore.disabled=true;
        try{
          await api('/api/postits/'+note.id,{method:'PUT',body:JSON.stringify({archived:false})});
          await reloadHomePostits();closeModal();
        }catch(error){restore.disabled=false;showUiError(error,'Impossible de restaurer ce Post-it')}
      };
      line.append(title,restore);root.appendChild(line);
    }
    $('#postitArchiveClose').onclick=closeModal;
  }catch(error){showUiError(error,'Impossible de charger les archives des Post-it')}
}
function initPostits(){
  $('#postitAdd')?.addEventListener('click',addHomePostit);
  $('#postitArchiveList')?.addEventListener('click',openPostitArchives);
  $('#homeNewPostit')?.addEventListener('click',addHomePostit);
}
initPostits();
