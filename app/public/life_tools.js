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
let lifeCaptureChoice='carnet',lifeAudioContext=null;
function lifeApi(path,opts){return api(path,opts)}
function lifeDate(s){return s?parseYMD(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Sans échéance'}
function lifeNumber(v){return Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2})}
function lifeSetText(id,text){const el=$(id);if(el)el.textContent=text}
async function loadLifeTools(){
  const settled=await Promise.allSettled([lifeApi('/api/trackers'),lifeApi('/api/admin'),lifeApi('/api/captures')]);
  if(settled[0].status==='fulfilled')lifeTrackers=settled[0].value;
  if(settled[1].status==='fulfilled')lifeAdmin=settled[1].value;
  if(settled[2].status==='fulfilled')lifeCaptures=settled[2].value;
  const failures=settled.filter(x=>x.status==='rejected');
  if(failures.length)showUiError(failures[0].reason,'Chargement du suivi et de l’administratif');
  renderLifeTools();
}
function lifeNode(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function lifeButton(label,callback,cls=''){const b=lifeNode('button',cls,label);b.type='button';b.onclick=callback;return b}
async function lifeAction(label,fn){const result=await runUiAction(label,fn);if(result.ok)await loadLifeTools();return result.ok}
function renderLifeTools(){
  renderLifeTrackers();renderLifeAdmin();renderLifeCaptures();renderJournalLifePage();
}
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
