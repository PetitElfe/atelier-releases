async function applyEventTemplate(f,touched={}){
  const title=f.title.value.trim(); if(!title) return;
  try{
    const tpl=await api(`/api/event-template?title=${encodeURIComponent(title)}`);
    if(!tpl?.found) return;
    if(!touched.category) f.category.value=tpl.category||'general';
    if(!touched.contact && !f.contact.value.trim()) f.contact.value=tpl.contact||'';
    if(!touched.travel_time && !f.travel_time.value.trim()) f.travel_time.value=tpl.travel_time||'';
    const hint=$('#eventTemplateHint'); if(hint) hint.textContent='Habitudes reprises du dernier rendez-vous portant ce nom.';
  }catch(e){}
}

function openEventModal(e=null,presetDate=null,presetTime=null,duplicate=false){
  const editing=!!e&&!duplicate;
  const reminders=Array.isArray(e?.reminders)
    ? e.reminders
    : e?.id
      ? state.reminders.filter(r=>r.entity_type==='event'&&Number(r.entity_id)===Number(e.id)&&r.status!=='done').map(r=>({title:r.title||'',remind_at:(r.snoozed_until||r.remind_at||'').slice(0,16)}))
      : [];
  // Une occurrence de série affiche les rappels à sa date effective,
  // sans modifier les rappels modèles de la série.
  if(!Array.isArray(e?.reminders)&&e?.recurrence&&e.recurrence!=='none'&&e.instance_date&&e.event_date&&e.instance_date!==e.event_date){
    const difference=parseYMD(e.instance_date).getTime()-parseYMD(e.event_date).getTime();
    for(const reminder of reminders){
      if(reminder.remind_at){
        const d=new Date(new Date(reminder.remind_at).getTime()+difference);
        reminder.remind_at=`${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
  }
  openModal(`<h2>${duplicate?'Dupliquer le rendez-vous':editing?'Modifier le rendez-vous':'Nouveau rendez-vous'}</h2><form id="eventForm" class="form-grid event-form-compact">
    <div class="field full"><label>Titre</label><input name="title" required value="${esc(e?.title||'')}"></div>
    <div class="field"><label>Date</label><input name="event_date" type="date" required value="${esc(e?.instance_date||e?.event_date||presetDate||ymd(state.cursor))}"></div>
    <div class="field"><label>Catégorie</label><select name="category"><option value="general">Général · blanc</option><option value="medical">Médical · vert</option><option value="important">Important · rouge</option></select></div>
    <div class="field"><label>Début</label><input name="start_time" type="time" value="${esc(e?.start_time||presetTime||'')}"></div>
    <div class="field"><label>Fin</label><input name="end_time" type="time" value="${esc(e?.end_time||'')}"></div>
    <div class="field"><label>Lieu</label><input name="location" value="${esc(e?.location||'')}"></div>
    <div class="field"><label>Contact</label><input name="contact" value="${esc(e?.contact||'')}"></div>
    <div class="field"><label>Temps de trajet</label><input name="travel_time" placeholder="ex. 25 min ou 1h10" value="${esc(e?.travel_time||'')}"></div>
    <div id="eventTemplateHint" class="field-help full"></div>
    <div class="field full"><label>URL</label><input name="url" type="url" placeholder="https://…" value="${esc(e?.url||'')}"></div>
    <div class="field"><label>Récurrence</label><select name="recurrence"><option value="none">Aucune</option><option value="daily">Tous les jours</option><option value="weekly">Toutes les semaines</option><option value="monthly">Tous les mois</option></select></div>
    <div class="field"><label>Statut</label><select name="status"><option value="planned">Prévu</option><option value="done">Effectué</option><option value="cancelled">Annulé</option></select></div>
    <div class="field full checkline"><input id="showInMonth" name="show_in_month" type="checkbox" ${e?.show_in_month===0?'':'checked'}><label for="showInMonth">Afficher aussi dans le mensuel</label></div>
    <div class="field full"><label>Notes / préparation</label><textarea name="notes">${esc(e?.notes||'')}</textarea></div>
    ${reminderEditor(reminders,'du rendez-vous',e?.instance_date||e?.event_date||presetDate||ymd(state.cursor))}
    <div id="eventSaveError" class="form-error field full hidden"></div>
    <div class="form-actions field full event-form-actions">${editing?'<button type="button" id="eventMore" class="event-more" aria-label="Actions du rendez-vous" title="Actions du rendez-vous">⋯</button>':''}<button type="button" id="cancelEvent">Annuler</button><button id="saveEvent" class="primary" type="submit">${duplicate?'Créer la copie':'Enregistrer'}</button></div>
  </form>`);
  const f=$('#eventForm'); f.category.value=e?.category||'general'; f.recurrence.value=e?.recurrence||'none'; f.status.value=e?.status||'planned'; wireReminderEditor(); $('#cancelEvent').onclick=closeModal;
  $('#eventMore')?.addEventListener('click',ev=>showAtelierContextMenu(ev.currentTarget,[
    {label:'Dupliquer le rendez-vous',run:()=>$('#duplicateEventAction')?.click()},
    ...(e?.url?[{label:'Ouvrir le lien',run:()=>window.open(e.url,'_blank','noopener,noreferrer')}]:[]),
    {label:'Supprimer le rendez-vous',danger:true,run:()=>$('#deleteEventAction')?.click()}
  ]));
  if(editing){
    const hidden=document.createElement('div');hidden.hidden=true;
    hidden.innerHTML='<button type="button" id="duplicateEventAction"></button><button type="button" id="deleteEventAction"></button>';f.appendChild(hidden);
  }
  $('#duplicateEventAction')?.addEventListener('click',()=>{
    const fd=new FormData(f); const copy=Object.fromEntries(fd.entries());
    copy.show_in_month=f.show_in_month.checked; copy.all_day=!copy.start_time;
    try{copy.reminders=collectReminders()}catch(err){
      const error=$('#eventSaveError');error.textContent=err.message;error.classList.remove('hidden');return;
    }
    // Le titre reste strictement identique : jamais de « (1) » ajouté automatiquement.
    openEventModal(copy,copy.event_date,copy.start_time,true);
  });
  $('#deleteEventAction')?.addEventListener('click',async()=>{
    const confirmed=await askUiConfirm('Supprimer le rendez-vous','Supprimer « '+(e.title||'ce rendez-vous')+' » et ses rappels associés ? Si ce rendez-vous est récurrent, toutes ses occurrences seront supprimées.','Supprimer',true);
    if(!confirmed)return;
    const result=await runUiAction('Impossible de supprimer le rendez-vous',()=>api('/api/events/'+e.id,{method:'DELETE'}));
    if(!result.ok)return;
    closeModal();
    await refresh();
  });
  const touched={category:false,contact:false,travel_time:false}; let templateTimer=null;
  if(!editing){
    f.category.addEventListener('change',()=>touched.category=true);
    f.contact.addEventListener('input',()=>touched.contact=true);
    f.travel_time.addEventListener('input',()=>touched.travel_time=true);
    f.title.addEventListener('input',()=>{clearTimeout(templateTimer);templateTimer=setTimeout(()=>applyEventTemplate(f,touched),300)});
  }
  f.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const submit=$('#saveEvent'), error=$('#eventSaveError');
    error.classList.add('hidden'); error.textContent='';
    submit.disabled=true; submit.textContent='Enregistrement…';
    if(!editing) await applyEventTemplate(f,touched);
    const fd=new FormData(f);
    const payload=Object.fromEntries(fd.entries());
    payload.show_in_month=f.show_in_month.checked;
    payload.all_day=!payload.start_time;
    try{payload.reminders=collectReminders()}catch(err){
      error.textContent=err.message;error.classList.remove('hidden');
      submit.disabled=false;submit.textContent=duplicate?'Créer la copie':'Enregistrer';return;
    }
    let route=editing?`/api/events/${e.id}`:'/api/events';
    if(editing&&e.recurrence&&e.recurrence!=='none'){
      const scope=await chooseRecurringEventScope('Modifier');
      if(!scope){
        openEventModal({...e,...payload,id:e.id,instance_date:e.instance_date,reminders:payload.reminders});
        return;
      }
      const instanceDate=e.instance_date||e.event_date;
      if(scope==='single'){
        route=`/api/events/${e.id}/edit-instance`;
        payload.instance_date=instanceDate;
        payload.recurrence='none';
      }else{
        // Adapter la date de base de toute la série sans déplacer son ancrage
        // lorsque l'on édite une occurrence autre que la première.
        const gap=parseYMD(instanceDate).getTime()-parseYMD(e.event_date).getTime();
        const newBase=new Date(parseYMD(payload.event_date).getTime()-gap);
        payload.event_date=ymd(newBase);
        payload.reminders=payload.reminders.map(rem=>{
          const d=new Date(new Date(rem.remind_at).getTime()-gap);
          return {...rem,remind_at:`${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`};
        });
      }
    }
    const result=await runUiAction("Impossible d’enregistrer le rendez-vous",()=>api(route,{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok){
      if(!document.contains(f)){
        openEventModal({...e,...payload,id:e.id,instance_date:e.instance_date,reminders:payload.reminders});
      }else{
        error.textContent=result.error?.message||'Le rendez-vous n’a pas pu être enregistré.';
        error.classList.remove('hidden');
        submit.disabled=false; submit.textContent=duplicate?'Créer la copie':'Enregistrer';
      }
      return;
    }
    closeModal();
    state.cursor=parseYMD(payload.event_date);
    await refresh();
  });
}

function openTaskModal(t=null,presetObjectiveNodeId=null){
  const editing=!!t?.id;
  const originView=state.view;
  const libraryContext=originView==='library'&&typeof librarySelectedDomainId!=='undefined'
    ? {domainId:librarySelectedDomainId,notebookId:librarySelectedNotebookId,pageId:librarySelectedPageId,editorMode:typeof libraryEditorMode!=='undefined'?libraryEditorMode:'write'}
    : null;
  const linkedObjectiveId=editing?t.objective_node_id:presetObjectiveNodeId;
  const reminders=editing
    ? state.reminders.filter(r=>r.entity_type==='task'&&r.entity_id===t.id&&r.status!=='done').map(r=>({title:r.title||'',remind_at:(r.snoozed_until||r.remind_at).slice(0,16)}))
    : [];
  openModal(`<h2>${editing?'Modifier la tâche':'Nouvelle tâche'}</h2><form id="taskForm" class="form-grid">
    <div class="field full"><label>Tâche</label><input name="title" required value="${esc(t?.title||'')}"></div>
    <div class="field"><label>Date</label><input name="due_date" type="date" value="${esc(t?.due_date||ymd(new Date()))}"></div>
    <div class="field"><label>Heure</label><input name="due_time" type="time" value="${esc(t?.due_time||'')}"></div>
    <div class="field full"><label>Bibliothèque / sous-objectif lié</label><select name="objective_node_id">${objectiveSelectOptions(linkedObjectiveId)}</select><div class="field-help">Facultatif : la tâche apparaîtra aussi dans le domaine ou le sous-objectif choisi.</div></div>
    <div class="field full checkline"><input id="important" name="important" type="checkbox" ${t?.important?'checked':''}><label for="important">Important 👺</label></div>
    <div class="field full"><label>Notes</label><textarea name="notes">${esc(t?.notes||'')}</textarea></div>
    ${reminderEditor(reminders,'de la tâche',t?.due_date||ymd(new Date()))}
    <div class="form-actions field full"><button type="button" id="cancelTask">Annuler</button><button id="saveTask" class="primary" type="button">Enregistrer</button></div>
  </form>`);
  const f=$('#taskForm');wireReminderEditor();if(typeof wireNoEnterSubmit==='function')wireNoEnterSubmit(f);
  $('#cancelTask').onclick=closeModal;
  $('#saveTask').onclick=async()=>{
    if(!f.reportValidity())return;
    const submit=$('#saveTask');submit.disabled=true;submit.textContent='Enregistrement…';
    const fd=new FormData(f),payload=Object.fromEntries(fd.entries());
    payload.objective_node_id=payload.objective_node_id||null;
    payload.important=f.important.checked;
    payload.reminders=collectReminders();
    const result=await runUiAction("Impossible d’enregistrer la tâche",()=>api(editing?`/api/tasks/${t.id}`:'/api/tasks',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok){submit.disabled=false;submit.textContent='Enregistrer';return}
    closeModal();await refresh();
    if(originView==='library'&&libraryContext?.domainId&&typeof loadLibraryNotebooks==='function'){
      librarySelectedDomainId=libraryContext.domainId;
      librarySelectedNotebookId=libraryContext.notebookId;
      librarySelectedPageId=libraryContext.pageId;
      libraryEditorMode=libraryContext.editorMode;
      showView('library');
      $('#libraryHubPanel')?.classList.add('hidden');
      $('#libraryDomainPanel')?.classList.remove('hidden');
      await loadLibraryNotebooks(libraryContext.domainId,libraryContext.notebookId,libraryContext.pageId);
    }else if(originView&&originView!==state.view){
      showView(originView);
    }
  };
}

function openPostponeEventModal(e){
  const date=e?.instance_date||e?.event_date||ymd(new Date());
  const time=e?.start_time||'09:00';
  openModal(`<h2>Reporter le rendez-vous</h2><form id="postponeEventForm" class="form-grid">
    <div class="field"><label>Nouvelle date</label><input id="postponeEventDate" type="date" required value="${esc(date)}"></div>
    <div class="field"><label>Nouvelle heure</label><input id="postponeEventTime" type="time" required value="${esc(time)}"></div>
    <div id="postponeEventError" class="form-error field full hidden"></div>
    <div class="form-actions field full"><button type="button" id="cancelPostponeEvent">Annuler</button><button id="submitPostponeEvent" class="primary" type="submit">Reporter</button></div>
  </form>`);
  $('#cancelPostponeEvent').onclick=closeModal;
  $('#postponeEventForm').onsubmit=async ev=>{
    ev.preventDefault();
    const submit=$('#submitPostponeEvent'), error=$('#postponeEventError');
    const new_date=$('#postponeEventDate').value, new_time=$('#postponeEventTime').value;
    error.classList.add('hidden'); error.textContent='';
    submit.disabled=true; submit.textContent='Report…';
    try{
      await api(`/api/events/${e.id}/postpone-instance`,{method:'PUT',body:JSON.stringify({instance_date:e.instance_date||e.event_date,new_date,new_time})});
      closeModal();
      await refresh();
    }catch(err){
      error.textContent=err?.message||'Le report a échoué.';
      error.classList.remove('hidden');
      submit.disabled=false; submit.textContent='Reporter';
      showUiError(err,'Impossible de reporter le rendez-vous');
    }
  };
}

function openSnooze(r){
  const raw=(r.snoozed_until||r.remind_at||'').slice(0,16);
  openModal(`<h2>Reporter le rappel</h2><form id="snoozeForm" class="form-grid">
    <div class="field"><label>Nouvelle date</label><input id="snoozeDate" type="date" required value="${esc(raw.slice(0,10)||ymd(new Date()))}"></div>
    <div class="field"><label>Nouvelle heure</label><input id="snoozeTime" type="time" required value="${esc(raw.length>=16?raw.slice(11,16):'')}"></div>
    <div id="snoozeError" class="form-error field full hidden"></div>
    <div class="form-actions field full"><button type="button" id="cancelSnooze">Annuler</button><button id="submitSnooze" class="primary">Reporter</button></div>
  </form>`);
  $('#cancelSnooze').onclick=closeModal;
  $('#snoozeForm').onsubmit=async e=>{
    e.preventDefault();
    const submit=$('#submitSnooze'), error=$('#snoozeError');
    const when=`${$('#snoozeDate').value}T${$('#snoozeTime').value}`;
    error.classList.add('hidden'); error.textContent='';
    submit.disabled=true; submit.textContent='Report…';
    const result=await runUiAction('Impossible de reporter le rappel',()=>api(`/api/reminders/${r.id}/snooze`,{method:'PUT',body:JSON.stringify({snoozed_until:when})}));
    if(!result.ok){
      error.textContent=result.error?.message||'Le report a échoué.';
      error.classList.remove('hidden');
      submit.disabled=false; submit.textContent='Reporter';
      return;
    }
    shown.delete(r.id);
    closeModal();await refresh();
  };
}

function localIsoSeconds(d=new Date()){
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
async function checkDue(){
  try{
    const due=await api(`/api/reminders/due?now=${encodeURIComponent(localIsoSeconds())}`);
    due.forEach(r=>notifyReminder(r));
  }catch(e){
    console.warn('[Atelier] Vérification des rappels impossible',e);
  }
}
const shown=new Set();
function notifyReminder(r){
  if(shown.has(r.id))return;
  const title=r.title||r.entity_title||`Rappel #${r.id}`;
  const kind=reminderKindLabel(r);
  const when=formatReminderMoment(r.snoozed_until||r.remind_at);

  try{
    if('Notification' in window && Notification.permission==='granted'){
      const systemNotification=new Notification(`🔔 Rappel : ${title}`,{
        body:`${when} · ${kind}\nClique pour ouvrir L’Atelier.`,
        requireInteraction:notificationPersistentPreference(),
        tag:`atelier-reminder-${r.id}`,
        renotify:true
      });
      systemNotification.onclick=()=>{
        try{window.focus()}catch(_){}
        showView('reminders');
        systemNotification.close();
      };
    }
  }catch(e){
    console.warn('[Atelier] Notification système impossible',e);
  }

  const t=document.createElement('div');
  t.className='toast';
  t.innerHTML=`<strong>🔔 ${esc(title)}</strong><div class="task-meta">${esc(when)} · ${esc(kind)}</div><div class="task-actions"><button class="finish reminder-icon-action" title="Fini" aria-label="Fini">✓</button><button class="later reminder-icon-action" title="Reporter" aria-label="Reporter">↪</button></div>`;
  t.querySelector('.finish').onclick=async()=>{await api(`/api/reminders/${r.id}/done`,{method:'PUT',body:'{}'});shown.delete(r.id);t.remove();await refresh()};
  t.querySelector('.later').onclick=()=>{shown.delete(r.id);t.remove();openSnooze(r)};
  $('#toastArea').appendChild(t);
  shown.add(r.id);
}

async function checkRuntimeCompatibility(){
  try{
    const r=await fetch('/api/runtime-version',{cache:'no-store'});
    if(!r.ok) throw new Error('runtime endpoint unavailable');
    const data=await r.json();
    const uiText=document.querySelector('.eyebrow')?.textContent||'';
    const m=uiText.match(/(\d+\.\d+\.\d+)/);
    const uiVersion=m?m[1]:'';
    if(uiVersion && data.version!==uiVersion){
      showUiError(new Error(`Interface ${uiVersion}, serveur Python ${data.version}. Arrête puis relance complètement L’Atelier.`),'Serveur Python à redémarrer');
      return false;
    }
    return true;
  }catch(err){
    showUiError(new Error("Un ancien serveur Python de L’Atelier est probablement encore actif. Ferme complètement L’Atelier puis relance-le."),'Serveur Python trop ancien');
    return false;
  }
}

document.getElementById('globalHomeShortcut')?.addEventListener('click',()=>{
  if(state.view==='library'&&typeof libraryLeaveExpanded==='function')libraryLeaveExpanded();
  showView('home');
});
// Replier le tiroir après la sélection d'une rubrique, sans gêner son déplacement.
document.querySelectorAll('#sideNav [data-view]').forEach(button=>button.addEventListener('click',()=>{
  setSideNavCollapsed(true);
}));
function showView(view){
  const enteringLibrary=view==='library'&&state.view!=='library';
  if(state.view==='library'&&view!=='library'&&typeof persistLibraryBeforeNavigation==='function')persistLibraryBeforeNavigation();
  if(state.view==='library'&&view!=='library'&&typeof libraryLeaveExpanded==='function')libraryLeaveExpanded();
  state.view=view;
  if(view!=='recipe' && view!=='settings') localStorage.setItem('atelierLastView',view);
  $$('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $(`#${view}View`).classList.add('active-view');
  const titles={home:'Accueil',calendar:'Calendrier',tasks:'Tâches',library:'Bibliothèque',reminders:'Rappels',organisation:'Habitudes & cycle',budget:'Budget et dépenses',kitchen:'Courses & repas',cuisine:'Cuisine',recipe:'Recette',settings:'Paramètres'};
  $('#pageTitle').textContent=localStorage.getItem('atelierNavLabel_'+view)||titles[view]||'L’Atelier';
  if(view==='settings')renderSettings();
  if(view==='budget')loadBudget();
  document.body.classList.toggle('home-active',view==='home');
  if(view==='calendar') applyCalendarMode();
  if(view==='organisation'||view==='calendar') refreshOrganisation();
  syncGlobalLayoutEditing();
  // Ne pas reconstruire un éditeur à partir d'un état ancien pendant le changement d'onglet.
  if(enteringLibrary&&typeof librarySelectedDomainId!=='undefined'&&librarySelectedDomainId){
    window.__atelierLibraryViewRestoring=true;
    render();
    Promise.all([...librarySaveQueues.values()].map(p=>p.catch(()=>false))).then(async()=>{
      const domain=librarySelectedDomainId,notebook=librarySelectedNotebookId,page=librarySelectedPageId;
      if(domain&&state.view==='library')await loadLibraryNotebooks(domain,notebook,page);
    }).catch(err=>showUiError(err,'Impossible de restaurer la Bibliothèque')).finally(()=>{window.__atelierLibraryViewRestoring=false});
  }else render();
}
function setCalendarMode(mode){state.calendarMode=mode;applyCalendarMode();}
function applyCalendarMode(){
  $$('.calendar-modes button').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode===state.calendarMode));
  $$('.calendar-panel').forEach(p=>p.classList.remove('active-calendar-panel'));
  $(`#${state.calendarMode}Panel`).classList.add('active-calendar-panel');
}

document.querySelectorAll('.tabs button[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

function syncSideNavEdge(left){
  const nav=$('#sideNav');
  if(!nav)return;
  const width=nav.offsetWidth||220;
  const onLeft=left+(width/2)<window.innerWidth/2;
  nav.classList.toggle('side-nav-on-left',onLeft);
  const collapseX=onLeft?-(left+width):(window.innerWidth-left);
  nav.style.setProperty('--side-nav-collapse-x',collapseX+'px');
}

function setSideNavCollapsed(collapsed){
  const nav=$('#sideNav');
  if(!nav)return;
  const storedLeft=parseFloat(nav.style.left);
  const left=Number.isFinite(storedLeft)?storedLeft:nav.getBoundingClientRect().left;
  syncSideNavEdge(left);
  nav.classList.toggle('is-collapsed',collapsed);
  localStorage.setItem('atelierSideNavCollapsed',collapsed?'1':'0');
  const toggle=$('#sideNavToggle');
  if(toggle){
    toggle.setAttribute('aria-label',collapsed?'Afficher le menu':'Masquer le menu');
    toggle.title=collapsed?'Afficher le menu':'Masquer le menu';
  }
}

function clampSideNavPosition(left,top){
  const nav=$('#sideNav');
  const width=nav?.offsetWidth||220;
  const height=nav?.offsetHeight||260;
  const minLeft=0;
  const maxLeft=Math.max(minLeft,window.innerWidth-width);
  const minTop=8;
  const maxTop=Math.max(minTop,window.innerHeight-height-8);
  return {left:Math.min(maxLeft,Math.max(minLeft,left)),top:Math.min(maxTop,Math.max(minTop,top))};
}

function applySideNavPosition(pos=null){
  const nav=$('#sideNav');
  if(!nav)return;
  let saved=pos;
  if(!saved){
    try{saved=JSON.parse(localStorage.getItem('atelierSideNavPosition')||'null')}catch(e){saved=null}
  }
  const fallback={left:window.innerWidth-(nav.offsetWidth||220),top:84};
  // Les anciennes positions enregistrées au milieu de l'écran sont réinitialisées.
  // Seuls les emplacements à proximité d'un bord restent personnalisés.
  const width=nav.offsetWidth||220;
  const candidate=Number(saved?.left);
  const edgeThreshold=Math.max(90,width*0.55);
  const validEdge=Number.isFinite(candidate)&&(candidate<=edgeThreshold||candidate>=window.innerWidth-width-edgeThreshold);
  if(saved&&!validEdge){
    saved=null;
    localStorage.removeItem('atelierSideNavPosition');
  }
  const next=clampSideNavPosition(saved&&Number.isFinite(Number(saved.left))?Number(saved.left):fallback.left,saved&&Number.isFinite(Number(saved.top))?Number(saved.top):fallback.top);
  nav.style.left=next.left+'px';
  nav.style.right='auto';
  nav.style.top=next.top+'px';
  syncSideNavEdge(next.left);
  return next;
}

function initSideNavDrag(){
  const nav=$('#sideNav'), handle=$('#sideNavDragHandle');
  if(!nav||!handle)return;
  let active=false,startX=0,startY=0,startLeft=0,startTop=0;
  handle.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault();
    const rect=nav.getBoundingClientRect();
    active=true;startX=e.clientX;startY=e.clientY;startLeft=parseFloat(nav.style.left)||rect.left;startTop=parseFloat(nav.style.top)||rect.top;
    handle.setPointerCapture?.(e.pointerId);
    nav.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove',e=>{
    if(!active)return;
    const next=applySideNavPosition({left:startLeft+(e.clientX-startX),top:startTop+(e.clientY-startY)});
    if(next)localStorage.setItem('atelierSideNavPosition',JSON.stringify(next));
  });
  const stop=e=>{
    if(!active)return;
    active=false;
    nav.classList.remove('is-dragging');
    try{handle.releasePointerCapture?.(e.pointerId)}catch(_){}
  };
  handle.addEventListener('pointerup',stop);
  handle.addEventListener('pointercancel',stop);
}

applySideNavPosition();
const sideNavInitiallyCollapsed=localStorage.getItem('atelierSideNavCollapsed')==='1';
setSideNavCollapsed(sideNavInitiallyCollapsed);
initSideNavDrag();
window.addEventListener('resize',()=>{
  const next=applySideNavPosition();
  if(next)localStorage.setItem('atelierSideNavPosition',JSON.stringify(next));
});
$('#sideNavToggle').onclick=()=>setSideNavCollapsed(!$('#sideNav').classList.contains('is-collapsed'));
$('#addStandaloneReminder').onclick=()=>openReminderModal();
$$('.calendar-modes button').forEach(b=>b.addEventListener('click',()=>setCalendarMode(b.dataset.calendarMode)));
$('#openCalendarCard').onclick=()=>{if(!globalLayoutEditing)showView('calendar')};
$('#openCalendarFromUpcoming').onclick=()=>{if(!globalLayoutEditing)showView('calendar')};
$('#openTasksFromHome').onclick=()=>showView('tasks');
$('#addLibraryDomain').onclick=()=>openLibraryDomainCreateModal();
$('#libraryBack').onclick=()=>closeLibraryDomain();
$('#addLibraryNotebook').onclick=()=>{if(librarySelectedDomainId)openLibraryNotebookModal(librarySelectedDomainId)};
$('#addLibrarySubgoal').onclick=()=>{if(librarySelectedDomainId)openLibrarySubgoalModal(librarySelectedDomainId)};
$('#addLibraryTask').onclick=()=>{if(librarySelectedDomainId)openTaskModal(null,librarySelectedDomainId)};
$('#libraryDomainConfigure').onclick=()=>{const d=objectiveNodeById(librarySelectedDomainId);if(d)openLibraryDomainConfigModal(d)};
$('#libraryDomainDelete').onclick=()=>{const d=objectiveNodeById(librarySelectedDomainId);if(d)deleteLibraryDomain(d)};
$('#libraryNotebookEdit').onclick=()=>{const n=(libraryNotebookState.sections||[]).find(x=>Number(x.id)===Number(librarySelectedNotebookId));if(n)openLibraryNotebookModal(librarySelectedDomainId,n)};
$('#libraryNotebookDelete').onclick=()=>{const n=(libraryNotebookState.sections||[]).find(x=>Number(x.id)===Number(librarySelectedNotebookId));if(n)deleteLibraryNotebook(librarySelectedDomainId,n)};
const addCurrentLibraryPage=()=>{const n=(libraryNotebookState.sections||[]).find(x=>Number(x.id)===Number(librarySelectedNotebookId));if(n)createLibraryPage(n)};
$('#addLibraryPage').onclick=addCurrentLibraryPage;
$('#addLibraryPageSmall').onclick=addCurrentLibraryPage;
$('#prevMonth').onclick=()=>{state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1);refresh()}; $('#nextMonth').onclick=()=>{state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+1,1);refresh()};
$('#prevWeek').onclick=()=>{state.cursor.setDate(state.cursor.getDate()-7);state.cursor=new Date(state.cursor);refresh()}; $('#nextWeek').onclick=()=>{state.cursor.setDate(state.cursor.getDate()+7);state.cursor=new Date(state.cursor);refresh()};
const DATE_FORMAT_OPTIONS={
  long:{day:'numeric',month:'long',year:'numeric'},
  weekday:{weekday:'long',day:'numeric',month:'long',year:'numeric'},
  numeric:{day:'2-digit',month:'2-digit',year:'numeric'}
};
function dateFormatPreference(){
  const value=localStorage.getItem('atelierDateFormat')||'long';
  return DATE_FORMAT_OPTIONS[value]?value:'long';
}
function notificationPersistentPreference(){
  return localStorage.getItem('atelierNotificationPersistent')!=='0';
}
function formatTopDate(value,format=dateFormatPreference()){
  if(!value)return '';
  return parseYMD(value).toLocaleDateString('fr-FR',DATE_FORMAT_OPTIONS[format]||DATE_FORMAT_OPTIONS.long);
}
function syncTopDate(){
  const input=$('#jumpDate'), label=$('#jumpDateLabel');
  if(input&&label)label.textContent=formatTopDate(input.value);
}
const jumpDateInput=$('#jumpDate');
jumpDateInput.value=ymd(new Date());
syncTopDate();
$('#jumpDateLabel').onclick=()=>{
  if(typeof jumpDateInput.showPicker==='function')jumpDateInput.showPicker();
  else jumpDateInput.click();
};
jumpDateInput.onchange=e=>{
  syncTopDate();
  if(e.target.value){state.cursor=parseYMD(e.target.value);showView('calendar');refresh()}
};
$('#addTask').onclick=()=>openTaskModal(); $('#addEventWeek').onclick=()=>openEventModal(null,ymd(state.cursor)); $('#modalClose').onclick=closeModal;
$('#addShopping').onclick=()=>openShoppingModal(); $('#addFood').onclick=()=>openFoodModal(); $('#chooseMealIdea').onclick=()=>openMealIdeaPicker(); $('#validateShopping').onclick=()=>validateShoppingPurchases();
$('#homeMealIdeaPicker').onclick=()=>openMealIdeaPicker();
$('#addRecipe').onclick=()=>openRecipeModal(); $('#importRecipe').onclick=()=>openRecipeImportModal(); $('#addRecipeBook').onclick=()=>openRecipeBookModal();
// Un clic accidentel autour d'un formulaire ne le ferme plus : on protège ce qui est en cours d'écriture.
$('#modalBackdrop').addEventListener('click',e=>{ if(e.target===$('#modalBackdrop')) e.preventDefault(); });
function syncNotifyButton(){
  const b=$('#notifyBtn'); if(!b)return;
  const granted=('Notification' in window)&&Notification.permission==='granted';
  b.textContent=granted?'🔔':'🔕';
  b.classList.toggle('is-active',granted);
  b.title=granted?'Notifications activées':'Activer les notifications';
  b.setAttribute('aria-label',b.title);
}
$('#notifyBtn').onclick=async()=>{ if(!('Notification' in window)){showUiMessage('Notifications indisponibles','Cette version du moteur d’affichage ne prend pas en charge les notifications système.');return} await Notification.requestPermission(); syncNotifyButton(); renderSettings(); };

let settingsReturnView='home';
function notificationPermissionLabel(){
  if(!('Notification' in window))return 'Indisponibles';
  if(Notification.permission==='granted')return 'Autorisées';
  if(Notification.permission==='denied')return 'Bloquées';
  return 'Non autorisées';
}
function renderSettings(){
  const dateSelect=$('#settingsDateFormat');
  const preview=$('#settingsDatePreview');
  const persistent=$('#settingsNotificationPersistent');
  const status=$('#settingsNotificationStatus');
  const permission=$('#settingsNotificationPermission');
  if(dateSelect){
    dateSelect.value=dateFormatPreference();
    if(preview)preview.textContent=formatTopDate(ymd(new Date()),dateSelect.value);
  }
  if(persistent)persistent.checked=notificationPersistentPreference();
  if(status)status.textContent=notificationPermissionLabel();
  if(permission){
    const granted=('Notification' in window)&&Notification.permission==='granted';
    permission.textContent=granted?'Notifications autorisées':'Autoriser les notifications';
    permission.disabled=granted||!('Notification' in window);
  }
}
function openSettings(){
  if(state.view!=='settings'&&state.view!=='recipe')settingsReturnView=state.view;
  showView('settings');
}
$('#settingsBtn').onclick=openSettings;
$('#settingsBack').onclick=()=>showView(settingsReturnView||localStorage.getItem('atelierLastView')||'home');
$('#settingsDateFormat').onchange=e=>{
  localStorage.setItem('atelierDateFormat',e.target.value);
  syncTopDate();
  renderSettings();
};
$('#settingsNotificationPersistent').onchange=e=>{
  localStorage.setItem('atelierNotificationPersistent',e.target.checked?'1':'0');
};
$('#settingsNotificationPermission').onclick=async()=>{
  if(!('Notification' in window)){renderSettings();return}
  await Notification.requestPermission();
  syncNotifyButton();
  renderSettings();
};
$('#settingsNavReset').onclick=()=>{
  localStorage.removeItem('atelierSideNavPosition');
  setSideNavCollapsed(false);
  const nav=$('#sideNav');
  if(nav){
    const next=applySideNavPosition({left:window.innerWidth-(nav.offsetWidth||220),top:84});
    if(next)localStorage.setItem('atelierSideNavPosition',JSON.stringify(next));
  }
};

function createLayoutEditor({view, toggle, reset, hint, specs, prefix}){
  if(!view||!toggle||!reset)return;
  specs=specs.filter(x=>x.el);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const key=id=>prefix+id;

  function read(id){
    try{
      const v=JSON.parse(localStorage.getItem(key(id)));
      return v&&typeof v==='object'?{x:Number(v.x)||0,y:Number(v.y)||0,scale:Number(v.scale)||1}:{x:0,y:0,scale:1};
    }catch(e){return{x:0,y:0,scale:1}}
  }
  function save(id,d){localStorage.setItem(key(id),JSON.stringify(d))}
  function apply(item,d){
    item.el.style.setProperty('--layout-x',(d.x||0)+'px');
    item.el.style.setProperty('--layout-y',(d.y||0)+'px');
    item.el.style.setProperty('--layout-scale',String(d.scale||1));
    const value=item.el.querySelector('.layout-scale-value');
    if(value)value.textContent=Math.round((d.scale||1)*100)+'%';
  }
  function setScale(item,next){
    const d=read(item.id); d.scale=clamp(next,.45,1.6); save(item.id,d); apply(item,d);
  }
  function beginMove(e,item){
    if(!view.classList.contains('layout-editing')||e.button!==0)return;
    if(e.target.closest('.layout-size-btn,.layout-resize-handle'))return;
    e.preventDefault(); e.stopPropagation();
    const d=read(item.id), sx=e.clientX, sy=e.clientY, ox=d.x||0, oy=d.y||0;
    item.el.classList.add('layout-selected');
    const move=ev=>{d.x=ox+(ev.clientX-sx);d.y=oy+(ev.clientY-sy);apply(item,d)};
    const up=()=>{save(item.id,d);item.el.classList.remove('layout-selected');document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up)};
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
  }
  function beginResize(e,item){
    if(!view.classList.contains('layout-editing')||e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    const d=read(item.id), startScale=d.scale||1, sx=e.clientX, sy=e.clientY;
    item.el.classList.add('layout-selected');
    const move=ev=>{const delta=((ev.clientX-sx)+(ev.clientY-sy))/650;d.scale=clamp(startScale+delta,.45,1.6);apply(item,d)};
    const up=()=>{save(item.id,d);item.el.classList.remove('layout-selected');document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up)};
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
  }

  specs.forEach(item=>{
    item.el.classList.add('layout-object');
    let controls=item.el.querySelector(':scope > .layout-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='layout-controls';
      controls.innerHTML='<span class="layout-move-handle">✥ Déplacer</span><div class="layout-size-controls"><button type="button" class="layout-size-btn minus">−</button><span class="layout-scale-value">100%</span><button type="button" class="layout-size-btn plus">+</button></div><span class="layout-resize-handle" title="Tirer pour redimensionner">↘</span>';
      item.el.appendChild(controls);
    }
    apply(item,read(item.id));
    item.el.addEventListener('click',e=>{
      if(view.classList.contains('layout-editing') && !e.target.closest('.layout-controls')){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },true);
    item.el.addEventListener('mousedown',e=>beginMove(e,item));
    controls.querySelector('.layout-move-handle').addEventListener('mousedown',e=>beginMove(e,item));
    controls.querySelector('.layout-resize-handle').addEventListener('mousedown',e=>beginResize(e,item));
    controls.querySelector('.minus').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const d=read(item.id);setScale(item,(d.scale||1)-.05)});
    controls.querySelector('.plus').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const d=read(item.id);setScale(item,(d.scale||1)+.05)});
  });

  toggle.addEventListener('click',()=>{
    const editing=view.classList.toggle('layout-editing');
    toggle.textContent=editing?'✓ Terminer':'✥ Modifier la disposition';
    reset.classList.toggle('hidden',!editing);
    if(hint)hint.classList.toggle('hidden',!editing);
  });
  reset.addEventListener('click',()=>{
    specs.forEach(item=>{const d={x:0,y:0,scale:1};save(item.id,d);apply(item,d)});
  });
}

/* ALPHA 0.16.0 — catalogue utilitaire de modules déjà existants.
   Les choix sont locaux au navigateur ; aucune donnée de carnet n'est déplacée. */
const homeShortcutDefs=[
  {id:'tasks',title:'Tâches',description:'Retrouver tes tâches et tes échéances.',view:'tasks'},
  {id:'reminders',title:'Rappels',description:'Voir les rappels à traiter.',view:'reminders'},
  {id:'library',title:'Bibliothèque',description:'Ouvrir les domaines et les carnets.',view:'library'},
  {id:'organisation',title:'Habitudes & cycle',description:'Accéder à tes suivis personnels.',view:'organisation'},
  {id:'kitchen',title:'Courses & repas',description:'Retrouver les listes et les aliments.',view:'kitchen'},
  {id:'cuisine',title:'Recettes',description:'Ouvrir la bibliothèque de recettes.',view:'cuisine'},
  {id:'settings',title:'Paramètres',description:'Configurer L’Atelier.',view:'settings'}
];
const homeModuleOrder=[
  ['budget','Budget'],['calendar','Calendrier'],['upcoming','À venir'],['journal','Journal'],
  ...homeShortcutDefs.map(item=>[item.id,item.title])
];
const homeModuleVisibilityKey=id=>'atelierHomeModuleVisible_'+id;
function homeModuleIsVisible(id){
  const stored=localStorage.getItem(homeModuleVisibilityKey(id));
  return stored===null?['budget','calendar','upcoming','journal'].includes(id):stored==='1';
}
function syncHomeModuleVisibility(){
  const sections=[...document.querySelectorAll('#homeView [data-home-module]')];
  for(const section of sections)section.classList.toggle('home-module-off',!homeModuleIsVisible(section.dataset.homeModule));
  const visible=sections.filter(el=>!el.classList.contains('home-module-off'));
  const notice=$('#homeModulesEmpty');
  if(notice)notice.classList.toggle('hidden',visible.length!==0);
}
function initHomeModuleLibrary(){
  const shelf=$('#homeShortcutShelf');
  if(!shelf)return;
  for(const info of homeShortcutDefs){
    const section=document.createElement('section');
    section.className='home-shortcut-card';
    section.dataset.homeModule=info.id;
    section.id='homeShortcut_'+info.id;
    const h=document.createElement('h3');h.textContent=info.title;
    const p=document.createElement('p');p.textContent=info.description;
    const button=document.createElement('button');button.type='button';button.textContent='Ouvrir →';
    button.dataset.homeOpen=info.view;
    button.addEventListener('click',()=>{if(!globalLayoutEditing)showView(info.view)});
    section.append(h,p,button);shelf.appendChild(section);
  }
  const empty=document.createElement('p');empty.id='homeModulesEmpty';empty.className='home-modules-empty muted hidden';
  empty.textContent='Aucun module affiché. Utilise « Bibliothèque de modules » pour en ajouter.';
  shelf.after(empty);
  syncHomeModuleVisibility();
  $('#openHomeModuleLibrary').onclick=()=>{
    const controls=homeModuleOrder.map(([id,label])=>{
      const el=$('#homeView [data-home-module="'+id+'"]');
      const spec=globalLayoutItems.find(item=>item.el===el);
      const title=spec?moduleTitleElement(spec):null;
      const name=title?.textContent.trim()||label;
      return '<label class="home-library-item"><input type="checkbox" data-module="'+esc(id)+'" '+(homeModuleIsVisible(id)?'checked':'')+'><span><strong>'+esc(name)+'</strong><small>'+(id==='journal'||id==='budget'||id==='calendar'||id==='upcoming'?'Module de l’Accueil':'Accès à une rubrique existante')+'</small></span></label>';
    }).join('');
    openModal('<h2>Bibliothèque de modules</h2><p class="muted">Choisis ce que tu souhaites voir sur l’Accueil. Les modules retirés restent disponibles ici, sans suppression de données.</p><form id="homeModulePicker"><div class="home-library-list">'+controls+'</div><div class="form-actions"><button type="button" id="homeModuleAll">Tout afficher</button><button type="submit" class="primary">Appliquer</button></div></form>');
    const form=$('#homeModulePicker');
    $('#homeModuleAll').onclick=()=>form.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=true);
    form.onsubmit=event=>{
      event.preventDefault();
      form.querySelectorAll('input[data-module]').forEach(input=>localStorage.setItem(homeModuleVisibilityKey(input.dataset.module),input.checked?'1':'0'));
      syncHomeModuleVisibility();
      syncGlobalLayoutEditing();
      closeModal();
    };
  };
}

let globalLayoutEditing=false;
let globalLayoutItems=[];

function getGlobalLayoutSpecs(){
  const base=[
    {view:'home',id:'calendar',el:$('#openCalendarCard'),key:'atelierLayout_calendar'},
    {view:'home',id:'upcoming',el:$('.desk-top-row .desk-note:nth-child(2)'),key:'atelierLayout_upcoming'},
    {view:'home',id:'journal',el:$('#journalBook'),key:'atelierLayout_journal'},
    {view:'calendar',id:'month',el:$('#monthPanel'),key:'atelierViewLayout_calendar_month'},
    {view:'calendar',id:'week',el:$('#weekPanel'),key:'atelierViewLayout_calendar_week'},
    {view:'tasks',id:'tasks',el:$('#taskList'),key:'atelierViewLayout_tasks_list'},
    {view:'reminders',id:'reminders',el:$('#reminderList'),key:'atelierViewLayout_reminders_list'},
    {view:'kitchen',id:'shopping',el:$('#shoppingPanel'),key:'atelierKitchenLayout_shopping'},
    {view:'kitchen',id:'foods',el:$('#foodPanel'),key:'atelierKitchenLayout_foods'},
    {view:'kitchen',id:'meals',el:$('#mealPanel'),key:'atelierKitchenLayout_meals'},
    {view:'cuisine',id:'library',el:$('.cuisine-library'),key:'atelierViewLayout_cuisine_library'},
    {view:'recipe',id:'recipe',el:$('.recipe-carnet'),key:'atelierViewLayout_recipe_carnet'}
  ].filter(x=>x.el);
  // Ajouter toutes les cartes et sections stables de chaque rubrique,
  // y compris la Bibliothèque, le Budget et les sections du journal.
  const selector=[
    '#homeBudgetWidget','#homeShortcutShelf .home-shortcut-card','#homeView .journal-section',
    '#organisationView .organisation-module',
    '#budgetSummaryPanel','#budgetSummaryPanel article','#budgetView .budget-action-bar',
    '#budgetRulesPanel','#budgetDebtsPanel','#budgetOpeningPanel','#budgetLedgerPanel','#budgetNotesPanel',
    '#libraryHubPanel','#libraryView .library-side-module','#libraryOverviewPanel',
    '#libraryNotebookPanel','#libraryNotebookPages','#libraryView .library-tasks-module',
    '#libraryView .library-page-sidebar',
    '#kitchenView .kitchen-panel',
    '#calendarView .mini-panel',
    '#cuisineView .recipe-library-sidebar','#cuisineView .recipe-library-content',
    '#settingsView .settings-card'
  ].join(',');
  const extra=[...document.querySelectorAll(selector)].map((el,index)=>{
    const view=el.closest('.view')?.id.replace(/View$/,'')||'home';
    const id=el.id||'panel_'+index;
    return {view,id,el,key:'atelierModuleLayout_'+view+'_'+id};
  });
  const seen=new Set();
  return [...base,...extra].filter(item=>{
    if(seen.has(item.el))return false;
    seen.add(item.el);
    return true;
  });
}
function moduleTitleElement(item){
  const el=item.el;
  if(el.id==='budgetSummaryPanel')return null;
  if(el.closest('#budgetSummaryPanel')&&el.tagName==='ARTICLE')return el.querySelector(':scope > span');
  if(el.id==='libraryNotebookPanel'||el.id==='libraryNotebookPages'||el.id==='libraryOverviewPanel')return null;
  if(el.classList.contains('journal-section')){
    const label=el.querySelector('.journal-heading');
    return label?.tagName==='BUTTON'?null:label;
  }
  if(el.id==='homeBudgetWidget')return el.querySelector('.budget-home-title strong');
  return el.querySelector(':scope > h3, :scope > h2, :scope > .library-head h2, :scope > .library-module-head strong, :scope > .kitchen-head h3, :scope > .settings-card-title h3, :scope > .recipe-books-title, :scope > .budget-home-title strong');
}
function moduleCustomNameKey(item){return 'atelierModuleName_'+item.view+'_'+item.id}
function applyModuleCustomName(item){
  const title=moduleTitleElement(item);if(!title)return;
  if(!title.dataset.defaultModuleName)title.dataset.defaultModuleName=title.textContent.trim();
  const saved=localStorage.getItem(moduleCustomNameKey(item));
  title.textContent=saved||title.dataset.defaultModuleName;
}
function openModuleNameEditor(item){
  const title=moduleTitleElement(item);
  if(!title)return;
  const oldName=title.dataset.defaultModuleName||title.textContent.trim();
  const saved=localStorage.getItem(moduleCustomNameKey(item))||oldName;
  openModal(`<h2>Renommer l'encadré</h2>
    <p class="muted">Tu modifies seulement le titre affiché, pas le contenu.</p>
    <form id="moduleRenameForm" class="form-grid">
      <div class="field full"><label>Nouveau nom</label>
        <input name="name" value="${esc(saved)}" required maxlength="70"></div>
      <div class="form-actions field full">
        <button type="button" id="moduleResetName">Nom d'origine</button>
        <button type="submit" class="primary">Enregistrer</button>
      </div>
    </form>`);
  const form=$('#moduleRenameForm');
  $('#moduleResetName').onclick=()=>{localStorage.removeItem(moduleCustomNameKey(item));applyModuleCustomName(item);closeModal()};
  form.onsubmit=e=>{
    e.preventDefault();
    const value=form.elements.name.value.trim();
    if(!value)return;
    if(value===oldName)localStorage.removeItem(moduleCustomNameKey(item));
    else localStorage.setItem(moduleCustomNameKey(item),value);
    applyModuleCustomName(item);closeModal();
  };
}
function initNavCustomization(){
  const buttons=[...document.querySelectorAll('#sideNav [data-view]')];
  for(const b of buttons){
    b.dataset.originalLabel=b.textContent.trim();
    const saved=localStorage.getItem('atelierNavLabel_'+b.dataset.view);
    if(saved)b.textContent=saved;
  }
  $('#renameNavButton').onclick=()=>{
    openModal(`<h2>Renommer le tiroir</h2>
      <p class="muted">Ces noms ne changent pas les fonctionnalités ni tes données.</p>
      <form id="atelierNavRenameForm" class="form-grid">${buttons.map(b=>
        `<div class="field"><label>${esc(b.dataset.originalLabel)}</label>
         <input name="${esc(b.dataset.view)}" maxlength="60" required value="${esc(b.textContent.trim())}"></div>`
      ).join('')}
        <div class="form-actions field full">
          <button type="button" id="atelierNavReset">Noms d'origine</button>
          <button class="primary" type="submit">Enregistrer</button>
        </div>
      </form>`);
    $('#atelierNavReset').onclick=()=>{
      buttons.forEach(b=>{localStorage.removeItem('atelierNavLabel_'+b.dataset.view);b.textContent=b.dataset.originalLabel});
      closeModal();showView(state.view);
    };
    $('#atelierNavRenameForm').onsubmit=e=>{
      e.preventDefault();
      const form=e.currentTarget;
      buttons.forEach(b=>{
        const value=form.elements[b.dataset.view].value.trim();
        if(!value)return;
        if(value===b.dataset.originalLabel)localStorage.removeItem('atelierNavLabel_'+b.dataset.view);
        else localStorage.setItem('atelierNavLabel_'+b.dataset.view,value);
        b.textContent=value;
      });
      closeModal();showView(state.view);
    };
  };
}

/* ALPHA 0.15.2 : dimensions indépendantes, interactions protégées et annulation de réinitialisation. */
function readGlobalLayout(item){
  try{
    const data=JSON.parse(localStorage.getItem(item.key));
    if(!data||typeof data!=='object')return {x:0,y:0,scale:1,width:null,height:null};
    const sane=n=>Number.isFinite(Number(n))?Number(n):null;
    return {x:sane(data.x)||0,y:sane(data.y)||0,scale:sane(data.scale)||1,
      width:data.width==null?null:sane(data.width),height:data.height==null?null:sane(data.height)};
  }catch(_){return {x:0,y:0,scale:1,width:null,height:null}}
}
function saveGlobalLayout(item,d){
  const value={x:d.x||0,y:d.y||0,scale:d.scale||1,
    width:d.width==null?null:Math.round(d.width),
    height:d.height==null?null:Math.round(d.height)};
  localStorage.setItem(item.key,JSON.stringify(value));
}
// Chaque carte conserve la place qu'elle occupait dans la grille.
 // Les dimensions ajoutées doivent être visuelles, sans repousser les cartes suivantes.
function ensureLayoutNaturalHeight(item){
  if(item.layoutNaturalHeight>0)return;
  const el=item.el;
  const oldHeight=el.style.minHeight,oldMargin=el.style.marginBottom;
  el.style.minHeight='';
  el.style.marginBottom='';
  const rect=el.getBoundingClientRect();
  if(rect.height>0){
    item.layoutNaturalHeight=rect.height;
    item.layoutNaturalMarginBottom=parseFloat(getComputedStyle(el).marginBottom)||0;
  }
  el.style.minHeight=oldHeight;
  el.style.marginBottom=oldMargin;
}
function applyGlobalLayout(item,d){
  item.el.style.setProperty('--layout-x',(d.x||0)+'px');
  item.el.style.setProperty('--layout-y',(d.y||0)+'px');
  item.el.style.setProperty('--layout-scale',String(d.scale||1));
  item.el.style.width=d.width!=null?Math.round(d.width)+'px':'';
  // L'agrandissement vertical ne doit pas modifier la position des autres cartes.
  // Une marge négative compense strictement la hauteur supplémentaire dans le flux.
  // La hauteur naturelle reste le minimum, afin de préserver le contenu.
  if(d.height!=null){
    ensureLayoutNaturalHeight(item);
    item.el.style.minHeight=Math.round(d.height)+'px';
    if(item.layoutNaturalHeight>0){
      const excess=Math.max(0,Math.round(d.height)-item.layoutNaturalHeight);
      item.el.style.marginBottom=(item.layoutNaturalMarginBottom-excess)+'px';
    }
  }else{
    item.el.style.minHeight='';
    item.el.style.marginBottom='';
  }
  const value=item.el.querySelector(':scope > .layout-controls .layout-scale-value');
  if(value){
    const rect=item.el.getBoundingClientRect();
    value.textContent=Math.round(rect.width)+' × '+Math.round(rect.height);
  }
}
function layoutUndoKey(view){return 'atelierLayoutResetUndo_'+view}
function syncGlobalLayoutEditing(){
  $$('.view').forEach(v=>v.classList.remove('layout-editing'));
  if(globalLayoutEditing){
    const view=$('#'+state.view+'View');if(view)view.classList.add('layout-editing');
  }
  // Les rubriques initialement masquées ne peuvent être mesurées qu'une fois visibles.
  globalLayoutItems.filter(item=>item.view===state.view).forEach(item=>{
    applyGlobalLayout(item,readGlobalLayout(item));
  });
  const toggle=$('#globalLayoutEdit'),reset=$('#globalLayoutReset'),undo=$('#globalLayoutUndo');
  if(toggle){
    toggle.textContent=globalLayoutEditing?'✓ Terminer':'Modifier';
    toggle.classList.toggle('is-active',globalLayoutEditing);
    toggle.setAttribute('aria-pressed',globalLayoutEditing?'true':'false');
  }
  if(reset)reset.classList.toggle('hidden',!globalLayoutEditing);
  if(undo)undo.classList.toggle('hidden',!globalLayoutEditing||!localStorage.getItem(layoutUndoKey(state.view)));
}
function initGlobalLayoutEditor(){
  globalLayoutItems=getGlobalLayoutSpecs();
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  // Le clic normal d'un encadré (notamment le mini-calendrier) ne doit PAS
  // activer ses boutons et liens pendant la manipulation de la disposition.
  $$('.view').forEach(view=>view.addEventListener('click',event=>{
    if(!globalLayoutEditing||view.id!==state.view+'View')return;
    const target=event.target.closest?.('.layout-object');
    if(!target||event.target.closest('.layout-controls'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true));

  globalLayoutItems.forEach(item=>{
    item.el.classList.add('layout-object');
    let controls=item.el.querySelector(':scope > .layout-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='layout-controls';
      controls.innerHTML=`<span class="layout-move-handle" title="Glisser pour déplacer cet encadré">✥ Déplacer</span>
        <button class="layout-rename-handle" type="button" title="Renommer cet encadré">⋯ Renommer</button>
        <span class="layout-scale-value" aria-label="Dimensions">—</span>
        <span class="layout-width-handle" title="Étirer la largeur" aria-label="Étirer la largeur">↔</span>
        <span class="layout-height-handle" title="Étirer la hauteur" aria-label="Étirer la hauteur">↕</span>
        <span class="layout-resize-handle" title="Étirer largeur et hauteur" aria-label="Étirer largeur et hauteur">↘</span>`;
      item.el.appendChild(controls);
    }
    applyGlobalLayout(item,readGlobalLayout(item));
    applyModuleCustomName(item);
    // Les contrôles sont parfois dans une carte cliquable (mini-calendrier).
    // On laisse leurs actions fonctionner sans faire remonter le clic à la carte.
    controls.addEventListener('click',event=>event.stopPropagation());
    const rename=controls.querySelector('.layout-rename-handle');
    if(rename){
      const canRename=!!moduleTitleElement(item);
      rename.hidden=!canRename;
      if(canRename)rename.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();openModuleNameEditor(item);
      });
    }
    function finishInteraction(d,move,up,cancel){
      saveGlobalLayout(item,d);
      item.el.classList.remove('layout-selected');
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',cancel);
      applyGlobalLayout(item,d);
    }
    const beginMove=event=>{
      if(!globalLayoutEditing||state.view!==item.view||event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const d=readGlobalLayout(item),sx=event.clientX,sy=event.clientY,ox=d.x,oy=d.y;
      item.el.classList.add('layout-selected');
      const move=ev=>{
        d.x=clamp(ox+ev.clientX-sx,-window.innerWidth+100,window.innerWidth-100);
        d.y=clamp(oy+ev.clientY-sy,-window.innerHeight+100,window.innerHeight*2);
        applyGlobalLayout(item,d);
      };
      const up=()=>finishInteraction(d,move,up,cancel);
      const cancel=()=>finishInteraction(d,move,up,cancel);
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',up);
      window.addEventListener('pointercancel',cancel);
    };
    // Au redimensionnement, largeur/hauteur deviennent de vraies dimensions CSS,
    // contrairement à l'ancien zoom qui agrandissait également tout le texte.
    const beginResize=(axis,event)=>{
      if(!globalLayoutEditing||state.view!==item.view||event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const d=readGlobalLayout(item);
      const rect=item.el.getBoundingClientRect();
      const sx=event.clientX,sy=event.clientY;
      const baseWidth=rect.width,baseHeight=rect.height;
      const isSmallCard=item.el.closest('#budgetSummaryPanel')&&item.el.tagName==='ARTICLE';
      const minWidth=isSmallCard?165:item.el.id==='openCalendarCard'?175:200;
      const maxWidth=Math.max(minWidth,Math.min(1400,window.innerWidth-48));
      const minHeight=isSmallCard?90:item.el.id==='openCalendarCard'?130:105;
      const maxHeight=1600;
      d.scale=1;
      item.el.classList.add('layout-selected');
      const move=ev=>{
        if(axis!=='height')d.width=clamp(baseWidth+ev.clientX-sx,minWidth,maxWidth);
        if(axis!=='width')d.height=clamp(baseHeight+ev.clientY-sy,minHeight,maxHeight);
        applyGlobalLayout(item,d);
      };
      const up=()=>finishInteraction(d,move,up,cancel);
      const cancel=()=>finishInteraction(d,move,up,cancel);
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',up);
      window.addEventListener('pointercancel',cancel);
    };
    controls.querySelector('.layout-move-handle')?.addEventListener('pointerdown',beginMove);
    controls.querySelector('.layout-width-handle')?.addEventListener('pointerdown',event=>beginResize('width',event));
    controls.querySelector('.layout-height-handle')?.addEventListener('pointerdown',event=>beginResize('height',event));
    controls.querySelector('.layout-resize-handle')?.addEventListener('pointerdown',event=>beginResize('both',event));
  });
  $('#globalLayoutEdit').onclick=()=>{globalLayoutEditing=!globalLayoutEditing;syncGlobalLayoutEditing()};
  $('#globalLayoutReset').onclick=()=>{
    const items=globalLayoutItems.filter(x=>x.view===state.view);
    if(!items.length)return;
    if(!confirm('Remettre la disposition par défaut ? Tu pourras annuler cette réinitialisation avec « Annuler la remise à zéro ».'))return;
    const snapshot=items.map(item=>({key:item.key,raw:localStorage.getItem(item.key)}));
    localStorage.setItem(layoutUndoKey(state.view),JSON.stringify(snapshot));
    items.forEach(item=>{
      const d={x:0,y:0,scale:1,width:null,height:null};
      saveGlobalLayout(item,d);applyGlobalLayout(item,d);
    });
    syncGlobalLayoutEditing();
  };
  $('#globalLayoutUndo').onclick=()=>{
    const key=layoutUndoKey(state.view);
    let snapshot;
    try{snapshot=JSON.parse(localStorage.getItem(key)||'[]')}catch(_){snapshot=[]}
    for(const entry of snapshot){
      if(!entry||!entry.key)continue;
      if(entry.raw===null)localStorage.removeItem(entry.key);
      else localStorage.setItem(entry.key,entry.raw);
    }
    localStorage.removeItem(key);
    globalLayoutItems.filter(x=>x.view===state.view).forEach(item=>applyGlobalLayout(item,readGlobalLayout(item)));
    syncGlobalLayoutEditing();
  };
  syncGlobalLayoutEditing();
}

initHomeModuleLibrary(); initNavCustomization();
applyCalendarMode(); syncNotifyButton(); initGlobalLayoutEditor();
// Toujours démarrer sur l'Accueil, sans réouvrir l'onglet de la session précédente.
localStorage.setItem('atelierLastView','home');
refresh().then(()=>{if(state.view==='home')showView('home')}); checkRuntimeCompatibility();
setInterval(checkDue,10000); setInterval(updateClock,30000); setTimeout(checkDue,1000);
window.addEventListener('focus',checkDue);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDue()});
let atelierLastDay=ymd(new Date());
setInterval(()=>{const d=ymd(new Date());if(d!==atelierLastDay){atelierLastDay=d;refresh();}},60000);
/* ALPHA 0.14 — habitudes et cycle : aucune donnée de cycle dans le journal d'Accueil. */
const organisationState={habits:[],periods:[]};
let organisationRefreshSerial=0;
async function refreshOrganisation(){
  const serial=++organisationRefreshSerial;
  try{
    const [habits,periods]=await Promise.all([api('/api/habits'),api('/api/cycle-periods')]);
    if(serial!==organisationRefreshSerial)return;
    organisationState.habits=habits;organisationState.periods=periods;
    renderOrganisation();
    renderMonth();renderMiniMonth();
  }catch(err){showUiError(err,'Impossible de charger le suivi')}
}
function localDayAdd(iso,days){
  const date=parseYMD(iso);date.setDate(date.getDate()+days);return ymd(date);
}
function dayDistance(start,end){
  return Math.round((parseYMD(end)-parseYMD(start))/86400000);
}
function isRecordedCycleDay(day){
  return organisationState.periods.some(p=>p.start_date<=day&&day<=(p.end_date||p.start_date));
}
function cycleEstimate(){
  const dates=[...new Set(organisationState.periods.map(x=>x.start_date))].sort();
  const intervals=[];
  for(let i=1;i<dates.length;i++){
    const d=dayDistance(dates[i-1],dates[i]);
    if(d>=21&&d<=45)intervals.push(d);
  }
  if(!intervals.length)return null;
  const recent=intervals.slice(-6),avg=Math.round(recent.reduce((a,b)=>a+b,0)/recent.length);
  let next=localDayAdd(dates[dates.length-1],avg);
  const today=ymd(new Date());
  while(next<today)next=localDayAdd(next,avg);
  return {next,average:avg,approxDays:Math.max(0,dayDistance(today,next))};
}
function renderOrganisation(){
  const habits=$('#habitList'),entries=$('#cycleEntries'),forecast=$('#cycleForecast');
  if(habits){
    const week=monday(new Date()),days=Array.from({length:7},(_,i)=>ymd(new Date(week.getFullYear(),week.getMonth(),week.getDate()+i)));
    habits.innerHTML=organisationState.habits.length?'':'<p class="muted">Aucune habitude enregistrée pour le moment.</p>';
    for(const habit of organisationState.habits){
      const checked=new Set(habit.checked_dates||[]);
      const count=days.filter(day=>checked.has(day)).length;
      const card=document.createElement('article');card.className='habit-card';
      card.innerHTML='<div class="habit-card-head"><strong>'+esc(habit.title)+'</strong><small>'+count+' / '+habit.target_per_week+' cette semaine</small><button type="button" class="habit-archive" title="Archiver cette habitude">Archiver</button></div><div class="habit-week">'+days.map((day,i)=>'<label><input type="checkbox" data-day="'+day+'" '+(checked.has(day)?'checked':'')+'><span>'+['L','M','M','J','V','S','D'][i]+'</span></label>').join('')+'</div>';
      card.querySelectorAll('[data-day]').forEach(input=>input.onchange=async()=>{
        const ok=await runUiAction('Enregistrer cette journée',()=>api('/api/habits/'+habit.id+'/check',{method:'PUT',body:JSON.stringify({date:input.dataset.day,done:input.checked})}));
        if(!ok.ok)input.checked=!input.checked;
        else await refreshOrganisation();
      });
      card.querySelector('.habit-archive').onclick=async()=>{
        if(!confirm('Archiver cette habitude ? Les journées enregistrées seront conservées.'))return;
        const result=await runUiAction('Archiver cette habitude',()=>api('/api/habits/'+habit.id,{method:'DELETE'}));
        if(result.ok)await refreshOrganisation();
      };
      habits.appendChild(card);
    }
  }
  if(forecast){
    const prediction=cycleEstimate();
    forecast.textContent=prediction?'Prochaines règles estimées vers le '+fmtFrenchDate(parseYMD(prediction.next))+' (environ '+prediction.approxDays+' jour(s), cycle moyen de '+prediction.average+' jours).':'Ta période enregistrée apparaît dans le calendrier. Une seule date suffit pour le suivi ; deux débuts de cycles sont nécessaires pour une estimation indicative.';
  }
  if(entries){
    entries.innerHTML=organisationState.periods.length?'':'<p class="muted">Aucune période enregistrée.</p>';
    for(const period of organisationState.periods){
      const card=document.createElement('div');card.className='cycle-entry';
      card.innerHTML='<span>Début : '+esc(period.start_date)+(period.end_date?' · Fin : '+esc(period.end_date):'')+'</span><button type="button">Supprimer</button>';
      card.querySelector('button').onclick=async()=>{
        if(!card.querySelector('.cycle-inline-confirm')){
          const ask=document.createElement('div');ask.className='cycle-inline-confirm';
          ask.innerHTML='<span>Supprimer cette période enregistrée ?</span><button type="button" class="cycle-cancel-delete">Conserver</button><button type="button" class="cycle-accept-delete">Supprimer</button>';
          ask.querySelector('.cycle-cancel-delete').onclick=()=>ask.remove();
          ask.querySelector('.cycle-accept-delete').onclick=async()=>{
            const response=await runUiAction('Supprimer la période',()=>api('/api/cycle-periods/'+period.id,{method:'DELETE'}));
            if(response.ok)await refreshOrganisation();
          };
          card.appendChild(ask);
        }
      };entries.appendChild(card);
    }
  }
  const hint=$('#calendarCycleHint');
  if(hint){
    const prediction=cycleEstimate();
    hint.classList.toggle('hidden',!prediction);
    hint.replaceChildren();
    if(prediction){
      const label=document.createElement('span');
      label.textContent='Suivi du cycle : prochaines règles estimées vers le '+fmtFrenchDate(parseYMD(prediction.next))+'. ';
      const link=document.createElement('button');link.type='button';link.textContent='Voir mon suivi →';link.onclick=()=>showView('organisation');
      hint.append(label,link);
    }
  }
}
$('#habitFrequency')?.addEventListener('change',event=>{
  $('#habitTarget').value=event.target.value==='daily'?'7':'3';
});
$('#habitCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const title=$('#habitTitle').value.trim();if(!title)return;
  const result=await runUiAction('Créer une habitude',()=>api('/api/habits',{method:'POST',body:JSON.stringify({title,frequency:$('#habitFrequency').value,target_per_week:Number($('#habitTarget').value)})}));
  if(result.ok){$('#habitTitle').value='';await refreshOrganisation()}
});
$('#cycleForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const start_date=$('#cycleStart').value,end_date=$('#cycleEnd').value;
  if(end_date&&end_date<start_date){showUiError(new Error('La fin doit suivre le début.'),'Vérifier les dates');return}
  const submit=$('#cycleForm button[type="submit"]');if(submit.disabled)return;
  submit.disabled=true;
  try{
    const result=await runUiAction('Enregistrer la période',()=>api('/api/cycle-periods',{method:'POST',body:JSON.stringify({start_date,end_date})}));
    if(result.ok){$('#cycleForm').reset();await refreshOrganisation()}
  }finally{submit.disabled=false}
});


/* ALPHA 0.15.1 — Budget financier local. Pas de données bancaires synchronisées. */
let budgetData=null;
let budgetSelectedMonth=ymd(new Date()).slice(0,7);
const budgetMoney=cents=>(Number(cents||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const budgetSafeDate=s=>String(s||'').slice(0,10);
function budgetFormData(form){const values=Object.fromEntries(new FormData(form).entries());values.planned=form.elements.planned?.checked||false;return values;}
async function budgetRequest(url,method,body,label){
  const result=await runUiAction(label,()=>api(url,{method,body:JSON.stringify(body)}));
  if(result.ok)await loadBudget();
  return result.ok;
}
async function loadBudget(month=budgetSelectedMonth){
  budgetSelectedMonth=month;
  const result=await runUiAction('Impossible de charger le Budget',()=>api('/api/budget?month='+encodeURIComponent(month)));
  if(!result.ok)return;
  budgetData=result.value;
  renderBudget();
  renderHomeBudgetWidget();
}
function askBudgetPaymentAmount(entry){
  return new Promise(resolve=>{
    openModal(`<div class="atelier-dialog"><h2>Confirmer ${entry.kind==='income'?'le revenu':'la dépense'}</h2>
      <p>${esc(entry.title)} · montant réellement ${entry.kind==='income'?'reçu':'payé'}</p>
      <form id="budgetConfirmForm" class="budget-form">
        <label>Montant réel (€) <input name="amount" type="number" min="0" step=".01" required value="${(entry.amount_cents/100).toFixed(2)}"></label>
        <label>Date effective <input name="actual_date" type="date" required value="${ymd(new Date())}"></label>
        <div class="form-actions"><button id="budgetCancelConfirm" type="button">Annuler</button>
          <button class="primary" type="submit">Confirmer</button></div>
      </form></div>`);
    const close=result=>{closeModal();resolve(result)};
    $('#budgetCancelConfirm').onclick=()=>close(null);
    $('#modalClose').onclick=()=>close(null);
    $('#budgetConfirmForm').onsubmit=ev=>{
      ev.preventDefault();
      const f=ev.currentTarget;close({amount:f.elements.amount.value,actual_date:f.elements.actual_date.value});
    };
  });
}
function budgetRow(entry){
  const row=document.createElement('div');row.className='budget-entry';
  const desc=document.createElement('div');
  desc.innerHTML='<strong>'+esc(entry.title)+'</strong><small>'+esc(entry.scheduled_date)+' · '+esc(entry.category||'Général')+' · '+esc(({pending:'Prévu',presumed:'Présumé payé',confirmed:'Confirmé',skipped:'Non effectué'})[entry.status]||entry.status)+'</small>';
  const money=document.createElement('span');money.className=entry.kind==='income'?'budget-positive':'budget-negative';money.textContent=(entry.kind==='income'?'+':'−')+budgetMoney(entry.amount_cents);
  row.append(desc,money);
  if(entry.status!=='confirmed'&&entry.status!=='skipped'){
    const confirm=document.createElement('button');confirm.textContent='Confirmer';confirm.onclick=async()=>{
      const value=await askBudgetPaymentAmount(entry);
      if(value===null)return;
      await budgetRequest('/api/budget/'+entry.id+'/status','PUT',{status:'confirmed',...value},'Confirmation impossible');
    };row.appendChild(confirm);
  }
  if(entry.status==='pending'||entry.status==='presumed'){
    const skip=document.createElement('button');skip.textContent='Non effectué';skip.onclick=()=>budgetRequest('/api/budget/'+entry.id+'/status','PUT',{status:'skipped'},'Modification impossible');row.appendChild(skip);
  }
  return row;
}
function renderBudget(){
  if(!budgetData)return;
  const b=budgetData, root=$('#budgetView');if(!root)return;
  $('#budgetMonth').value=budgetSelectedMonth;
  $('#budgetBalance').textContent=budgetMoney(b.balance_cents);
  $('#budgetForecast').textContent=budgetMoney(b.forecast_cents);
  $('#budgetIncome').textContent=budgetMoney(b.income_cents);
  $('#budgetExpenses').textContent=budgetMoney(b.expenses_cents);
  const entries=$('#budgetEntries');entries.innerHTML='';
  if(!b.entries.length)entries.innerHTML='<p class="muted">Aucune opération ce mois-ci.</p>';
  b.entries.forEach(e=>entries.appendChild(budgetRow(e)));
  const rules=$('#budgetRules');rules.innerHTML='';
  for(const r of b.rules){
    const el=document.createElement('div');el.className='budget-rule';
    el.innerHTML='<span><strong>'+esc(r.title)+'</strong><small>'+esc(r.kind==='income'?'Revenu':'Charge fixe')+' · jour '+r.day_of_month+' · '+esc(r.start_date)+(r.end_date?' au '+esc(r.end_date):'')+(r.active?'':' · arrêtée')+'</small></span><span>'+budgetMoney(r.amount_cents)+'</span>';
    if(r.active){const stop=document.createElement('button');stop.textContent='Arrêter';stop.onclick=()=>budgetRequest('/api/budget/'+r.id+'/archive','PUT',{kind:'rule'},'Arrêt impossible');el.appendChild(stop)}
    rules.appendChild(el);
  }
  const debts=$('#budgetDebts');debts.innerHTML='';
  for(const d of b.debts){
    const el=document.createElement('div');el.className='budget-rule';
    const box=document.createElement('span');box.innerHTML='<strong>'+esc(d.title)+'</strong><small>'+budgetMoney(d.repaid_cents)+' remboursés sur '+budgetMoney(d.total_cents)+' · reste '+budgetMoney(d.remaining_cents)+(d.archived?' · arrêtée':'')+'</small>';
    el.appendChild(box);
    if(!d.archived){const btn=document.createElement('button');btn.textContent='Arrêter';btn.onclick=()=>budgetRequest('/api/budget/'+d.id+'/archive','PUT',{kind:'debt'},'Arrêt impossible');el.appendChild(btn)}
    debts.appendChild(el);
  }
  $('#budgetNotes').value=b.notes||'';
  const settings=$('#budgetSettingsForm');settings.elements.opening_balance.value=(b.opening_balance_cents/100).toFixed(2);settings.elements.opening_date.value=b.opening_date;
}
function renderHomeBudgetWidget(){
  const root=$('#homeBudgetContent');if(!root)return;
  if(!budgetData){root.textContent='Ouvre le Budget pour configurer tes revenus et charges.';return}
  root.innerHTML='';
  const b=budgetData;
  const waiting=b.pending_income.filter(x=>x.scheduled_date<=ymd(new Date()));
  const coming=b.upcoming_charges.slice(0,3);
  if(!waiting.length&&!coming.length){root.textContent='Aucun revenu à confirmer ni prélèvement proche.';return}
  for(const e of waiting){
    const line=document.createElement('div');line.className='budget-home-line';
    const label=document.createElement('span');label.textContent='Reçu : '+e.title+' ('+budgetMoney(e.amount_cents)+') ?';
    const yes=document.createElement('button');yes.textContent='Oui';yes.onclick=()=>budgetRequest('/api/budget/'+e.id+'/status','PUT',{status:'confirmed',actual_date:ymd(new Date())},'Impossible de confirmer le revenu');
    line.append(label,yes);root.appendChild(line);
  }
  for(const e of coming){
    const p=document.createElement('div');p.className='budget-home-line';p.textContent=e.scheduled_date+' · '+e.title+' · '+budgetMoney(e.amount_cents);root.appendChild(p);
  }
}

/* Un seul éditeur pour les revenus, dépenses, abonnements et remboursements. */
function openBudgetEditor(){
  const today=ymd(new Date());
  openModal(`<div class="atelier-dialog budget-editor">
    <h2>Ajouter une opération</h2>
    <p class="muted">Le minimum d'abord. Les détails sont facultatifs.</p>
    <form id="budgetUnifiedForm" class="budget-unified-form">
      <div class="budget-type-switch" role="group" aria-label="Type d'opération">
        <button type="button" class="budget-kind is-selected" data-kind="expense">− Dépense</button>
        <button type="button" class="budget-kind" data-kind="income">＋ Revenu</button>
      </div>
      <label class="budget-primary-input">Montant (€)
        <input name="amount" inputmode="decimal" type="number" step=".01" min=".01" required placeholder="0,00" autofocus>
      </label>
      <label class="budget-primary-input">Nom
        <input name="title" required maxlength="120" placeholder="Ex. : Courses">
      </label>
      <fieldset class="budget-timing">
        <legend>Quand ?</legend>
        <label><input type="radio" name="timing" value="now" checked> Maintenant</label>
        <label><input type="radio" name="timing" value="later"> Plus tard</label>
      </fieldset>
      <label id="budgetWhenWrap" class="budget-editor-date hidden">Date prévue
        <input name="date" type="date" value="${today}" required>
      </label>
      <label class="budget-editor-repeat"><input name="repeat" type="checkbox"> Chaque mois</label>
      <details class="budget-more" id="budgetMoreOptions">
        <summary>Plus d'options</summary>
        <div class="budget-editor-advanced">
          <label>Catégorie <input name="category" maxlength="80" placeholder="Général"></label>
          <label id="budgetEndWrap" class="hidden">Date de fin (facultative)
            <input name="end_date" type="date"></label>
          <label id="budgetDebtWrap" class="budget-editor-repeat">
            <input name="is_debt" type="checkbox"> Suivre comme un crédit ou une dette
          </label>
          <label id="budgetMonthlyWrap" class="hidden">Mensualité (€)
            <input name="monthly" type="number" step=".01" min=".01" placeholder="Montant à rembourser chaque mois"></label>
          <label id="budgetNotesWrap">Note (facultative)
            <textarea name="notes" rows="2" maxlength="2000"></textarea></label>
        </div>
      </details>
      <div id="budgetEditorError" class="form-error hidden" role="alert"></div>
      <div class="form-actions">
        <button type="button" id="budgetEditorCancel">Annuler</button>
        <button type="submit" id="budgetEditorSave" class="primary">Enregistrer</button>
      </div>
    </form></div>`);
  const form=$('#budgetUnifiedForm');
  let kind='expense';
  const sync=()=>{
    const later=form.elements.timing.value==='later';
    const repeat=form.elements.repeat.checked;
    const debt=kind==='expense'&&form.elements.is_debt.checked;
    $('#budgetWhenWrap').classList.toggle('hidden',!later);
    $('#budgetEndWrap').classList.toggle('hidden',!repeat&&!debt);
    $('#budgetDebtWrap').classList.toggle('hidden',kind!=='expense');
    $('#budgetMonthlyWrap').classList.toggle('hidden',!debt);
    $('#budgetNotesWrap').classList.toggle('hidden',repeat||debt);
    form.elements.monthly.required=debt;
    form.elements.date.value=(!later&&form.elements.date.value!==today)?today:form.elements.date.value;
    const amountTitle=form.querySelector('.budget-primary-input');
    amountTitle.firstChild.textContent=debt?'Montant total de la dette (€)':'Montant (€)';
    $$('.budget-kind').forEach(b=>b.classList.toggle('is-selected',b.dataset.kind===kind));
  };
  $$('.budget-kind').forEach(button=>button.onclick=()=>{kind=button.dataset.kind;if(kind==='income')form.elements.is_debt.checked=false;sync()});
  form.querySelectorAll('input[name="timing"],input[name="repeat"],input[name="is_debt"]').forEach(el=>el.addEventListener('change',sync));
  $('#budgetEditorCancel').onclick=closeModal;
  sync();
  form.onsubmit=async ev=>{
    ev.preventDefault();
    const fields=Object.fromEntries(new FormData(form).entries());
    const debt=kind==='expense'&&form.elements.is_debt.checked;
    const recurring=form.elements.repeat.checked;
    const later=form.elements.timing.value==='later';
    const when=later?fields.date:ymd(new Date());
    const day=Number(when.slice(-2));
    let endpoint,body;
    if(debt){
      endpoint='/api/budget/debts';
      body={title:fields.title,total:fields.amount,monthly:fields.monthly,
        day_of_month:day,start_date:when,end_date:fields.end_date||null};
    }else if(recurring){
      endpoint='/api/budget/rules';
      body={kind:kind==='income'?'income':'fixed',title:fields.title,category:fields.category||'Général',
        amount:fields.amount,day_of_month:day,start_date:when,end_date:fields.end_date||null};
    }else{
      endpoint='/api/budget/entries';
      body={title:fields.title,amount:fields.amount,kind,category:fields.category||'Général',
        date:when,planned:later,notes:fields.notes||''};
    }
    const save=$('#budgetEditorSave');save.disabled=true;
    const result=await runUiAction('Impossible d’enregistrer cette opération',()=>api(endpoint,{method:'POST',body:JSON.stringify(body)}));
    if(result.ok){closeModal();await loadBudget();}
    else{const err=$('#budgetEditorError');if(err){err.textContent=result.error?.message||'Erreur inconnue';err.classList.remove('hidden')}}
    if(document.contains(save))save.disabled=false;
  };
}
function initBudget(){
  const month=$('#budgetMonth');if(!month)return;
  month.value=budgetSelectedMonth;
  month.onchange=()=>loadBudget(month.value);
  $('#homeBudgetOpen').onclick=()=>showView('budget');
  $('#budgetAddOperation').onclick=openBudgetEditor;
  $('#budgetSettingsForm').addEventListener('submit',async ev=>{
    ev.preventDefault();
    await budgetRequest('/api/budget/settings','PUT',budgetFormData(ev.currentTarget),'Impossible d’enregistrer le solde initial');
  });
  $('#budgetSaveNotes').onclick=()=>budgetRequest('/api/budget/notes','PUT',{month:budgetSelectedMonth,notes:$('#budgetNotes').value},'Impossible d’enregistrer les notes');
  loadBudget();
}

initBudget();
