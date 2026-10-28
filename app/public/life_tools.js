/* L'Atelier du Goblin — outils de vie ALPHA 0.18 : suivi, administratif,
   carnet de réception, capture rapide, pages du journal et son local.
   Les données sensibles restent dans la base SQLite de cette installation. */
const lifeDestinations=[
  {key:'carnet',tag:'#Carnet',label:'Carnet / boîte de réception'},
  {key:'taches',tag:'#Tâches',label:'Tâches'},
  {key:'rappels',tag:'#Rappels',label:'Rappels'},
  {key:'postit',tag:'#Post-it',label:'Post-it'},
  {key:'administratif',tag:'#Administratif',label:'Administratif'},
  {key:'tracker',tag:'#Tracker',label:'Tracker'}
];
let lifeTrackers=[],lifeAdmin=[],lifeCaptures=[],lifeJournalPage=0;
let lifeBoards=[],lifeArchivedBoards=[],lifeBoardMonth=ymd(new Date()).slice(0,7),lifeBoardArchivesVisible=false;
let lifeCaptureChoice='carnet',lifeAudioContext=null;
function lifeApi(path,opts){return api(path,opts)}
function lifeDate(s){return s?parseYMD(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Sans échéance'}
function lifeNumber(v){return Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2})}
function lifeSetText(id,text){const el=$(id);if(el)el.textContent=text}
async function loadLifeTools(){
  const month='?month='+encodeURIComponent(lifeBoardMonth);
  const settled=await Promise.allSettled([
    lifeApi('/api/trackers'),lifeApi('/api/admin'),lifeApi('/api/captures'),
    lifeApi('/api/tracker-boards'+month),lifeApi('/api/tracker-boards'+month+'&archived=1')
  ]);
  if(settled[0].status==='fulfilled')lifeTrackers=settled[0].value;
  if(settled[1].status==='fulfilled')lifeAdmin=settled[1].value;
  if(settled[2].status==='fulfilled')lifeCaptures=settled[2].value;
  if(settled[3].status==='fulfilled')lifeBoards=settled[3].value;
  if(settled[4].status==='fulfilled')lifeArchivedBoards=settled[4].value;
  const failures=settled.filter(x=>x.status==='rejected');
  if(failures.length)showUiError(failures[0].reason,'Chargement du suivi et de l’administratif');
  renderLifeTools();
}
function lifeNode(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function lifeButton(label,callback,cls=''){const b=lifeNode('button',cls,label);b.type='button';b.onclick=callback;return b}
async function lifeAction(label,fn){const result=await runUiAction(label,fn);if(result.ok)await loadLifeTools();return result.ok}
function renderLifeTools(){
  renderTrackerBoards();renderLifeTrackers();renderLifeAdmin();renderLifeCaptures();renderJournalLifePage();
}
/* Trackers visuels : tableaux indépendants, lignes x jours, un geste = une case.
   Le stockage n'est PAS le même que les anciens trackers numériques. */
function lifeTrackerDay(year,month,number){
  return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(number).padStart(2,'0');
}
function lifeTrackerChangeMonth(offset){
  const [year,month]=lifeBoardMonth.split('-').map(Number);
  const d=new Date(year,month-1+offset,1);
  lifeBoardMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  loadLifeTools();
}
function lifeTrackerMarkButton(board,line,day){
  const raw=line.marks?.[day];
  const active=raw!==undefined;
  const numeric=line.mode==='number';
  const button=lifeButton(numeric?(active?String(raw):'·'):(active?'●':''),
    async()=>{if(numeric){lifeEditTrackerNumber(button,board,line,day);return}
      const changed=active?null:true;
      button.disabled=true;
      const result=await runUiAction('Marquer un jour',()=>
        lifeApi('/api/tracker-board-rows/'+line.id+'/mark',
          {method:'PUT',body:JSON.stringify({day,value:changed})}));
      if(result.ok){
        if(changed===null)delete line.marks[day];
        else line.marks[day]='1';
        const next=lifeTrackerMarkButton(board,line,day);
        button.replaceWith(next);
      }else button.disabled=false;
    },'tracker-day-cell'+(active?' tracker-day-done':'')+
       (numeric?' tracker-day-number':''));
  button.type='button';
  button.setAttribute('aria-label',line.title+' · '+lifeDate(day)+' : '+
    (numeric?(active?'Valeur '+raw:'Saisir une valeur'):(active?'marqué':'non marqué')));
  if(!numeric)button.setAttribute('aria-pressed',String(active));
  button.title=(numeric?'Saisir une valeur pour ':'Cocher ou décocher ')+lifeDate(day);
  return button;
}
function lifeEditTrackerNumber(button,board,line,day){
  const input=lifeNode('input','tracker-number-editor');
  input.type='number';input.step='any';input.min='-1000000';input.max='1000000';
  input.value=line.marks?.[day]??'';
  input.setAttribute('aria-label','Valeur '+line.title+' · '+lifeDate(day));
  const original=input.value,holder=button.parentElement;
  holder.replaceChildren(input);input.focus();input.select();
  let finished=false;
  const restore=()=>holder.replaceChildren(lifeTrackerMarkButton(board,line,day));
  const close=async(save)=>{
    if(finished)return;finished=true;
    const value=input.value.trim();
    if(!save||value===original){restore();return}
    const numeric=value===''?null:Number(value);
    if(value!==''&&(!Number.isFinite(numeric)||Math.abs(numeric)>1000000)){
      showUiError(new Error('Entre un nombre valide (entre -1 000 000 et 1 000 000).'),'Tracker');
      restore();return;
    }
    input.disabled=true;
    const result=await runUiAction('Enregistrer une valeur',()=>
      lifeApi('/api/tracker-board-rows/'+line.id+'/mark',
        {method:'PUT',body:JSON.stringify({day,value:numeric})}));
    if(result.ok){
      if(numeric===null)delete line.marks[day];
      else line.marks[day]=String(numeric);
    }
    restore();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close(false)}
    if(e.key==='Enter'){e.preventDefault();close(true)}
  });
  input.addEventListener('blur',()=>close(true));
}
function renderTrackerBoards(){
  const root=$('#trackerBoardList');if(!root)return;
  const [year,month]=lifeBoardMonth.split('-').map(Number);
  const label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  lifeSetText('#trackerMonthLabel',label.charAt(0).toUpperCase()+label.slice(1));
  const archiveRoot=$('#trackerBoardArchiveList');archiveRoot?.replaceChildren();
  archiveRoot?.classList.toggle('hidden',!lifeBoardArchivesVisible);
  const archives=$('#trackerBoardArchivesToggle');
  if(archives){
    archives.setAttribute('aria-expanded',String(lifeBoardArchivesVisible));
    archives.textContent='Mes tableaux archivés ('+lifeArchivedBoards.length+')';
  }
  if(lifeBoardArchivesVisible&&archiveRoot){
    if(!lifeArchivedBoards.length)archiveRoot.append(lifeNode('p','life-muted','Aucun tableau archivé.'));
    lifeArchivedBoards.forEach(board=>{
      const item=lifeNode('div','tracker-archived-entry');
      item.append(lifeNode('strong','',board.title),lifeButton('Restaurer',()=>
        lifeAction('Restaurer le tableau',()=>lifeApi('/api/tracker-boards/'+board.id,
          {method:'PUT',body:JSON.stringify({archived:false})})),'tracker-restore'));
      archiveRoot.append(item);
    });
  }
  root.replaceChildren();
  if(!lifeBoards.length)root.append(lifeNode('p','tracker-empty',
    'Aucun tableau pour l’instant. Crée ton premier tableau, puis ajoute une ligne par habitude ou activité.'));
  const total=new Date(year,month,0).getDate();
  const today=ymd(new Date());
  lifeBoards.forEach(board=>{
    const section=lifeNode('section','tracker-board tracker-board-'+board.color);
    const head=lifeNode('div','tracker-board-head');
    const h=lifeNode('h3','',board.title);
    const action=lifeButton('Archiver le tableau',async()=>{
      const ok=await askUiConfirm('Archiver ce tableau',
        'Le tableau « '+board.title+' » et ses cases seront conservés dans Mes tableaux archivés.',
        'Archiver');
      if(ok)await lifeAction('Archiver le tableau',()=>
        lifeApi('/api/tracker-boards/'+board.id,
          {method:'PUT',body:JSON.stringify({archived:true})}));
    },'tracker-archive-button');
    head.append(h,action);
    const hint=lifeNode('p','life-muted','Clique sur une case pour marquer ta journée. Pour les lignes chiffrées, saisis une valeur. Fais défiler les jours horizontalement.');
    const viewport=lifeNode('div','tracker-board-scroll');
    viewport.tabIndex=0;viewport.setAttribute('aria-label','Tableau '+board.title+' pour '+label);
    const grid=lifeNode('div','tracker-board-grid');
    grid.style.setProperty('--tracker-days',String(total));
    const days=lifeNode('div','tracker-grid-line tracker-grid-dates');
    days.append(lifeNode('span','tracker-row-label','Mes suivis'));
    for(let d=1;d<=total;d++){
      const day=lifeTrackerDay(year,month,d),dateObj=new Date(year,month-1,d);
      const week=new Intl.DateTimeFormat('fr-FR',{weekday:'narrow'}).format(dateObj);
      const cell=lifeNode('span','tracker-grid-day'+(day===today?' tracker-today':''),week+'\n'+d);
      cell.title=lifeDate(day);
      days.append(cell);
    }
    grid.append(days);
    board.rows.forEach(line=>{
      const row=lifeNode('div','tracker-grid-line');
      const name=lifeNode('span','tracker-row-label',line.title);
      name.title=line.title+' · '+(line.mode==='number'?'nombre':'case à cocher');
      row.append(name);
      for(let d=1;d<=total;d++){
        const day=lifeTrackerDay(year,month,d);
        const holder=lifeNode('span','tracker-cell-wrap'+(day===today?' tracker-today':''));
        holder.append(lifeTrackerMarkButton(board,line,day));row.append(holder);
      }
      grid.append(row);
    });
    viewport.append(grid);
    if(!board.rows.length)viewport.append(lifeNode('p','life-muted',
      'Ajoute une ligne ci-dessous : lecture, marcher, prendre soin de moi…'));
    const form=lifeNode('form','tracker-add-row');
    const title=lifeNode('input','');title.name='title';title.required=true;
    title.maxLength=100;title.placeholder='Nouvelle ligne (ex. : Lecture)';
    title.setAttribute('aria-label','Nouvelle ligne dans '+board.title);
    const mode=lifeNode('select','');mode.name='mode';
    [['check','À cocher'],['number','Chiffre']].forEach(([value,text])=>{
      const opt=lifeNode('option','',text);opt.value=value;mode.append(opt);
    });
    mode.setAttribute('aria-label','Type de suivi');
    const submit=lifeNode('button','primary','+ Ajouter une ligne');submit.type='submit';
    form.append(title,mode,submit);
    form.onsubmit=async e=>{
      e.preventDefault();
      const ok=await lifeAction('Ajouter une ligne',()=>lifeApi(
        '/api/tracker-boards/'+board.id+'/rows',
        {method:'POST',body:JSON.stringify({title:title.value,mode:mode.value})}));
      if(ok)title.value='';
    };
    section.append(head,hint,viewport,form);root.append(section);
  });
}
$('#trackerBoardCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,v=Object.fromEntries(new FormData(form).entries());
  const ok=await lifeAction('Créer un tableau',()=>lifeApi('/api/tracker-boards',
    {method:'POST',body:JSON.stringify(v)}));
  if(ok)form.reset();
});
$('#trackerMonthPrev')?.addEventListener('click',()=>lifeTrackerChangeMonth(-1));
$('#trackerMonthNext')?.addEventListener('click',()=>lifeTrackerChangeMonth(1));
$('#trackerMonthToday')?.addEventListener('click',()=>{
  lifeBoardMonth=ymd(new Date()).slice(0,7);loadLifeTools();
});
$('#trackerBoardArchivesToggle')?.addEventListener('click',()=>{
  lifeBoardArchivesVisible=!lifeBoardArchivesVisible;renderTrackerBoards();
});

function renderLifeTrackers(){
  const root=$('#trackerList');if(!root)return;root.replaceChildren();
  if(!lifeTrackers.length)root.append(lifeNode('p','muted','Aucun tracker pour le moment. Crée ton premier suivi !'));
  lifeTrackers.forEach(t=>{
    const card=lifeNode('article','life-card');
    const heading=lifeNode('div','life-card-head');
    heading.append(lifeNode('strong','',t.title),lifeButton('Archiver',async()=>{
      if(!confirm('Archiver ce tracker ? Les mesures restent dans la base locale.'))return;
      await lifeAction('Archiver le tracker',()=>lifeApi('/api/trackers/'+t.id,{method:'DELETE'}));
    },'life-danger'));
    const last=t.entries?.[0];
    const summary=lifeNode('p','life-muted',last?'Dernière mesure : '+lifeNumber(last.value)+(t.unit?' '+t.unit:'')+' · '+lifeDate(last.entry_date):'Aucune mesure enregistrée');
    const form=lifeNode('form','life-entry-form');
    form.innerHTML='<label>Date<input name="entry_date" type="date" required></label><label>Valeur<input name="value" type="number" step="any" required></label><label>Note<input name="notes" maxlength="2000" placeholder="Facultatif"></label><button type="submit" class="primary">Enregistrer</button>';
    form.elements.entry_date.value=ymd(new Date());
    form.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form).entries());await lifeAction('Enregistrer la mesure',()=>lifeApi('/api/trackers/'+t.id+'/entries',{method:'PUT',body:JSON.stringify(v)}))};
    const history=lifeNode('div','life-history');
    (t.entries||[]).slice(0,8).forEach(entry=>history.append(lifeNode('span','life-history-item',lifeDate(entry.entry_date)+' · '+lifeNumber(entry.value)+(t.unit?' '+t.unit:''))));
    card.append(heading,summary,form,history);root.append(card);
  });
}
function renderLifeAdmin(){
  const root=$('#adminList');if(!root)return;root.replaceChildren();
  if(!lifeAdmin.length)root.append(lifeNode('p','muted','Aucune démarche enregistrée.'));
  const statusNames={todo:'À faire',waiting:'En attente',done:'Terminée'};
  lifeAdmin.forEach(item=>{
    const card=lifeNode('article','life-card'+(item.status==='done'?' life-complete':''));
    const heading=lifeNode('div','life-card-head');
    heading.append(lifeNode('strong','',item.title),lifeButton('Supprimer',async()=>{
      if(!confirm('Supprimer cette démarche et ses notes ?'))return;
      await lifeAction('Supprimer la démarche',()=>lifeApi('/api/admin/'+item.id,{method:'DELETE'}));
    },'life-danger'));
    const meta=lifeNode('div','life-muted',item.category+' · '+lifeDate(item.due_date));
    const select=lifeNode('select','life-status');
    Object.entries(statusNames).forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.append(opt)});
    select.value=item.status;
    select.onchange=async()=>{const ok=await lifeAction('Changer le statut',()=>lifeApi('/api/admin/'+item.id,{method:'PUT',body:JSON.stringify({status:select.value})}));if(!ok)select.value=item.status};
    const notes=lifeNode('textarea','life-admin-notes');notes.value=item.notes||'';notes.rows=2;notes.placeholder='Notes, pièces à préparer, contact…';
    const save=lifeButton('Enregistrer les notes',()=>lifeAction('Enregistrer les notes',()=>lifeApi('/api/admin/'+item.id,{method:'PUT',body:JSON.stringify({notes:notes.value})})));
    card.append(heading,meta,select,notes,save);root.append(card);
  });
}
function renderLifeCaptures(){
  const root=$('#captureInbox');if(!root)return;root.replaceChildren();
  const unread=lifeCaptures.filter(x=>!x.seen).length;
  const badge=$('#captureNavBadge');if(badge){badge.textContent=String(unread);badge.classList.toggle('hidden',unread===0)}
  if(!lifeCaptures.length)root.append(lifeNode('p','muted','La boîte est vide. Utilise la capture rapide pour envoyer une idée ici.'));
  lifeCaptures.forEach(item=>{
    const card=lifeNode('article','life-card life-capture'+(!item.seen?' life-unread':''));
    const tag=lifeDestinations.find(d=>d.key===item.destination)?.tag||'#Carnet';
    const head=lifeNode('div','life-card-head');
    head.append(lifeNode('strong','',tag+(item.seen?'':' · Nouveau')),
      lifeButton('Supprimer',async()=>{if(!confirm('Supprimer cette note ?'))return;await lifeAction('Supprimer la note',()=>lifeApi('/api/captures/'+item.id,{method:'DELETE'}))},'life-danger'));
    const content=lifeNode('button','life-capture-body',item.body);
    content.title='Consulter et marquer comme lu';
    content.onclick=async()=>{if(!item.seen)await lifeAction('Marquer comme consulté',()=>lifeApi('/api/captures/'+item.id,{method:'PUT',body:JSON.stringify({seen:true})}));};
    card.append(head,content,lifeNode('small','life-muted',item.created_at.replace('T',' ')));root.append(card);
  });
}
function renderJournalLifePage(){
  const trackers=$('#journalTrackerSummary'),admin=$('#journalAdminSummary'),captures=$('#journalCaptureSummary');
  if(trackers){trackers.replaceChildren();const list=lifeTrackers.slice(0,5);
    if(!list.length)trackers.append(lifeButton('Créer un tracker →',()=>showView('trackers'),'journal-life-link'));
    list.forEach(t=>trackers.append(lifeButton(t.title+' : '+(t.entries?.[0]?lifeNumber(t.entries[0].value)+(t.unit?' '+t.unit:''):'—'),()=>showView('trackers'),'journal-life-link')));
  }
  if(admin){admin.replaceChildren();const list=lifeAdmin.filter(x=>x.status!=='done').slice(0,5);
    if(!list.length)admin.append(lifeButton('Ajouter une démarche →',()=>showView('admin'),'journal-life-link'));
    list.forEach(d=>admin.append(lifeButton(d.title+(d.due_date?' · '+lifeDate(d.due_date):''),()=>showView('admin'),'journal-life-link')));
  }
  if(captures){captures.replaceChildren();const list=lifeCaptures.filter(x=>!x.seen).slice(0,6);
    if(!list.length)captures.append(lifeNode('p','journal-empty','Rien de nouveau.'));
    list.forEach(c=>captures.append(lifeButton((lifeDestinations.find(d=>d.key===c.destination)?.tag||'#Carnet')+' '+c.body.slice(0,48),()=>showView('captures'),'journal-life-link journal-unread')));
  }
}
function lifeSetJournalPage(index){
  lifeJournalPage=Math.max(0,Math.min(1,index));
  const book=$('#journalBook');book?.classList.toggle('journal-page-2',lifeJournalPage===1);
  lifeSetText('#journalPageNumber',lifeJournalPage?'3–4':'1–2');
  $('#journalPrevPage').disabled=lifeJournalPage===0;
  $('#journalNextPage').disabled=lifeJournalPage===1;
}
$('#journalPrevPage')?.addEventListener('click',()=>lifeSetJournalPage(0));
$('#journalNextPage')?.addEventListener('click',()=>lifeSetJournalPage(1));
$('#journalBackToToday')?.addEventListener('click',()=>lifeSetJournalPage(0));
$('#journalQuickCapture')?.addEventListener('click',()=>lifeOpenCapture());
$('#trackerCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  const v=Object.fromEntries(new FormData(form).entries());
  if(await lifeAction('Créer un tracker',()=>lifeApi('/api/trackers',{method:'POST',body:JSON.stringify(v)})))form.reset();
});
$('#adminCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  const v=Object.fromEntries(new FormData(form).entries());
  if(await lifeAction('Créer une démarche',()=>lifeApi('/api/admin',{method:'POST',body:JSON.stringify(v)})))form.reset();
});
$('#capturesOpenQuick')?.addEventListener('click',()=>lifeOpenCapture());
function lifeParseCapture(){
  const text=$('#quickCaptureText').value;
  const m=text.match(/^\s*(#[^\s]+)\s*/u);
  const found=m?lifeDestinations.find(d=>d.tag.toLocaleLowerCase('fr-FR')===m[1].toLocaleLowerCase('fr-FR')):null;
  if(found)lifeCaptureChoice=found.key;
  const body=found?text.slice(m[0].length).trim():text.replace(/^\s*#[^\s]+\s*/u,'').trim();
  return {destination:lifeCaptureChoice,body};
}
function lifeSuggestions(){
  const input=$('#quickCaptureText'),root=$('#quickCaptureSuggestions');if(!input||!root)return;
  const text=input.value,match=text.match(/^\s*#([^\s]*)/u);
  root.replaceChildren();
  if(!match){root.classList.add('hidden');return}
  root.classList.remove('hidden');
  const q=match[1].toLocaleLowerCase('fr-FR');
  lifeDestinations.filter(d=>d.tag.slice(1).toLocaleLowerCase('fr-FR').includes(q)).forEach(d=>{
    const button=lifeButton(d.tag+' · '+d.label,()=>{
      lifeCaptureChoice=d.key;
      input.value=d.tag+' '+text.slice(match[0].length).trimStart();
      root.classList.add('hidden');input.focus();
      input.setSelectionRange(input.value.length,input.value.length);
      lifeSetText('#quickCaptureDestination','Destination : '+d.label);
    },'quick-capture-suggestion');
    button.setAttribute('role','option');root.append(button);
  });
}
function lifeOpenCapture(){
  const overlay=$('#quickCaptureOverlay');overlay.classList.remove('hidden');
  lifeCaptureChoice='carnet';lifeSetText('#quickCaptureDestination','Destination : Carnet / boîte de réception');
  $('#quickCaptureText').value='';$('#quickCaptureSuggestions').classList.add('hidden');
  $('#quickCaptureText').focus();
}
function lifeCloseCapture(){$('#quickCaptureOverlay').classList.add('hidden')}
$('#quickCaptureClose')?.addEventListener('click',lifeCloseCapture);
$('#quickCaptureOverlay')?.addEventListener('click',e=>{if(e.target.id==='quickCaptureOverlay')lifeCloseCapture()});
$('#quickCaptureText')?.addEventListener('input',()=>{
  lifeSuggestions();const value=lifeParseCapture();
  const dest=lifeDestinations.find(d=>d.key===value.destination);
  lifeSetText('#quickCaptureDestination','Destination : '+(dest?.label||'Carnet'));
});
$('#quickCaptureSend')?.addEventListener('click',async()=>{
  const {destination,body}=lifeParseCapture();
  if(!body){$('#quickCaptureText').focus();return}
  const btn=$('#quickCaptureSend');btn.disabled=true;
  try{
    // Le carnet est une boîte de réception : ne pas prétendre écrire dans
    // un carnet de la bibliothèque sans avoir choisi le carnet précis.
    if(destination==='taches'){
      await lifeApi('/api/tasks',{method:'POST',body:JSON.stringify({title:body.slice(0,120),notes:body.slice(120)})});
    }else if(destination==='postit'){
      await lifeApi('/api/postits',{method:'POST',body:JSON.stringify({title:'Capture rapide',body,color:'gold',shape:'rounded'})});
    }else if(destination==='administratif'){
      await lifeApi('/api/admin',{method:'POST',body:JSON.stringify({title:body.slice(0,180),notes:body.slice(180)})});
    }else{
      await lifeApi('/api/captures',{method:'POST',body:JSON.stringify({destination,body})});
    }
    lifeCloseCapture();await loadLifeTools();await refresh();
    const toast=lifeNode('div','toast');
    toast.append(lifeNode('strong','','✓ Idée rangée'),lifeNode('div','task-meta',
      destination==='carnet'?'Ta note attend dans la boîte de réception #Carnet.':'Destination : '+(lifeDestinations.find(d=>d.key===destination)?.tag||destination)));
    $('#toastArea').append(toast);setTimeout(()=>toast.remove(),4500);
  }catch(err){showUiError(err,'Impossible de ranger la note')}
  finally{btn.disabled=false}
});
function lifeShortcut(){return localStorage.getItem('atelierQuickCaptureShortcut')||'Ctrl+Shift+Space'}
function lifeShortcutFromEvent(e){
  const mods=[e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);
  const key=e.code==='Space'?'Space':e.code.startsWith('Key')?e.code.slice(3):e.code.startsWith('Digit')?e.code.slice(5):e.key.length===1?e.key.toUpperCase():e.key;
  return [...mods,key].join('+');
}
$('#settingsQuickCaptureShortcut')?.addEventListener('keydown',async e=>{
  e.preventDefault();e.stopPropagation();
  if(e.key==='Escape'){e.currentTarget.blur();return}
  if(!e.ctrlKey&&!e.altKey&&!e.metaKey)return;
  if(['Control','Alt','Shift','Meta'].includes(e.key))return;
  const combination=lifeShortcutFromEvent(e),previous=lifeShortcut();
  const field=e.currentTarget;
  try{
    await lifeApi('/api/quick-capture/hotkey',{method:'POST',body:JSON.stringify({shortcut:combination})});
    localStorage.setItem('atelierQuickCaptureShortcut',combination);
    field.value=combination;field.blur();
    lifeSetText('#settingsGlobalShortcutStatus','Raccourci enregistré.');
  }catch(err){
    field.value=previous;
    showUiError(err,'Raccourci non enregistré');
  }
});
$('#settingsQuickCaptureOpen')?.addEventListener('click',lifeOpenCapture);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#quickCaptureOverlay').classList.contains('hidden')){e.preventDefault();lifeCloseCapture();return}
  if(!$('#quickCaptureOverlay').classList.contains('hidden')&&e.ctrlKey&&e.key==='Enter'){e.preventDefault();$('#quickCaptureSend').click();return}
  if(e.target?.id==='settingsQuickCaptureShortcut')return;
  if(lifeShortcutFromEvent(e)===lifeShortcut()){e.preventDefault();lifeOpenCapture()}
});
function lifeSoundEnabled(){return localStorage.getItem('atelierReminderSound')==='1'}
function lifeReminderChime(force=false){
  if(!force&&!lifeSoundEnabled())return;
  try{
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return;
    if(!lifeAudioContext)lifeAudioContext=new AudioContext();
    if(lifeAudioContext.state==='suspended')lifeAudioContext.resume().catch(()=>{});
    const now=lifeAudioContext.currentTime;
    [660,880].forEach((freq,i)=>{
      const oscillator=lifeAudioContext.createOscillator();
      const gain=lifeAudioContext.createGain();
      oscillator.type='sine';oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(.0001,now+i*.14);
      gain.gain.exponentialRampToValueAtTime(.12,now+i*.14+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,now+i*.14+.24);
      oscillator.connect(gain);gain.connect(lifeAudioContext.destination);
      oscillator.start(now+i*.14);oscillator.stop(now+i*.14+.25);
    });
  }catch(err){console.warn('[Atelier] Son de rappel indisponible',err)}
}
$('#settingsReminderSound')?.addEventListener('change',e=>{
  localStorage.setItem('atelierReminderSound',e.target.checked?'1':'0');
  if(e.target.checked)lifeReminderChime(true);
});
$('#settingsTestReminderSound')?.addEventListener('click',()=>lifeReminderChime(true));
function lifeRenderSettings(){
  const sound=$('#settingsReminderSound'),shortcut=$('#settingsQuickCaptureShortcut');
  if(sound)sound.checked=lifeSoundEnabled();
  if(shortcut)shortcut.value=lifeShortcut();
}
lifeSetJournalPage(0);
lifeRenderSettings();
lifeApi('/api/quick-capture/hotkey').then(result=>{
  if(result?.shortcut){
    localStorage.setItem('atelierQuickCaptureShortcut',result.shortcut);
    lifeRenderSettings();
  }
}).catch(err=>console.warn('[Atelier] Raccourci natif indisponible',err));
loadLifeTools();
