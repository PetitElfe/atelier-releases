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
  const reminders=duplicate&&Array.isArray(e?.reminders)
    ? e.reminders
    : editing
      ? state.reminders.filter(r=>r.entity_type==='event'&&r.entity_id===e.id&&r.status!=='done').map(r=>({title:r.title||'',remind_at:(r.snoozed_until||r.remind_at).slice(0,16)}))
      : [];
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
    <div class="form-actions field full"><button type="button" id="cancelEvent">Annuler</button>${editing?'<button type="button" id="duplicateEvent">Dupliquer</button><button type="button" id="openUrl">Ouvrir le lien</button>':''}<button class="primary" type="submit">${duplicate?'Créer la copie':'Enregistrer'}</button></div>
  </form>`);
  const f=$('#eventForm'); f.category.value=e?.category||'general'; f.recurrence.value=e?.recurrence||'none'; f.status.value=e?.status||'planned'; wireReminderEditor(); $('#cancelEvent').onclick=closeModal; $('#openUrl')?.addEventListener('click',()=>{if(e?.url)window.open(e.url,'_blank')});
  $('#duplicateEvent')?.addEventListener('click',()=>{
    const fd=new FormData(f); const copy=Object.fromEntries(fd.entries());
    copy.show_in_month=f.show_in_month.checked; copy.all_day=!copy.start_time; copy.reminders=collectReminders();
    // Le titre reste strictement identique : jamais de « (1) » ajouté automatiquement.
    openEventModal(copy,copy.event_date,copy.start_time,true);
  });
  const touched={category:false,contact:false,travel_time:false}; let templateTimer=null;
  if(!editing){
    f.category.addEventListener('change',()=>touched.category=true);
    f.contact.addEventListener('input',()=>touched.contact=true);
    f.travel_time.addEventListener('input',()=>touched.travel_time=true);
    f.title.addEventListener('input',()=>{clearTimeout(templateTimer);templateTimer=setTimeout(()=>applyEventTemplate(f,touched),300)});
  }
  f.addEventListener('submit',async ev=>{ev.preventDefault(); if(!editing) await applyEventTemplate(f,touched); const fd=new FormData(f); const payload=Object.fromEntries(fd.entries()); payload.show_in_month=f.show_in_month.checked; payload.all_day=!payload.start_time; payload.reminders=collectReminders(); const result=await runUiAction("Impossible d’enregistrer le rendez-vous",()=>api(editing?`/api/events/${e.id}`:'/api/events',{method:editing?'PUT':'POST',body:JSON.stringify(payload)})); if(!result.ok)return; closeModal(); state.cursor=parseYMD(payload.event_date); await refresh();});
}

function openTaskModal(t=null){ const editing=!!t; const reminders=editing?state.reminders.filter(r=>r.entity_type==='task'&&r.entity_id===t.id&&r.status!=='done').map(r=>({title:r.title||'',remind_at:(r.snoozed_until||r.remind_at).slice(0,16)})):[];
  openModal(`<h2>${editing?'Modifier la tâche':'Nouvelle tâche'}</h2><form id="taskForm" class="form-grid">
    <div class="field full"><label>Tâche</label><input name="title" required value="${esc(t?.title||'')}"></div>
    <div class="field"><label>Date</label><input name="due_date" type="date" value="${esc(t?.due_date||ymd(new Date()))}"></div>
    <div class="field"><label>Heure</label><input name="due_time" type="time" value="${esc(t?.due_time||'')}"></div>
    <div class="field full checkline"><input id="important" name="important" type="checkbox" ${t?.important?'checked':''}><label for="important">Important 👺</label></div>
    <div class="field full"><label>Notes</label><textarea name="notes">${esc(t?.notes||'')}</textarea></div>
    ${reminderEditor(reminders,'de la tâche',t?.due_date||ymd(new Date()))}
    <div class="form-actions field full"><button type="button" id="cancelTask">Annuler</button><button class="primary" type="submit">Enregistrer</button></div>
  </form>`); const f=$('#taskForm'); wireReminderEditor(); $('#cancelTask').onclick=closeModal; f.addEventListener('submit',async ev=>{ev.preventDefault(); const fd=new FormData(f);const payload=Object.fromEntries(fd.entries());payload.important=f.important.checked;payload.reminders=collectReminders();const result=await runUiAction("Impossible d’enregistrer la tâche",()=>api(editing?`/api/tasks/${t.id}`:'/api/tasks',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));if(!result.ok)return;closeModal();await refresh()}); }

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
    closeModal();await refresh();
  };
}

async function checkDue(){ try{ const due=await api(`/api/reminders/due?now=${encodeURIComponent(new Date().toISOString().slice(0,19))}`); due.forEach(r=>notifyReminder(r)); }catch(e){} }
const shown=new Set();
function notifyReminder(r){
  if(shown.has(r.id))return; shown.add(r.id); const title=r.title||r.entity_title||`Rappel #${r.id}`;
  if(Notification.permission==='granted') new Notification('L’Atelier',{body:title});
  const t=document.createElement('div');t.className='toast';t.innerHTML=`<strong>🔔 ${esc(title)}</strong><div class="task-meta">Rappel à traiter</div><div class="task-actions"><button class="finish">Fini</button><button class="later">Reporter</button></div>`;
  t.querySelector('.finish').onclick=async()=>{await api(`/api/reminders/${r.id}/finish`,{method:'PUT',body:'{}'});t.remove();await refresh()};
  t.querySelector('.later').onclick=()=>{t.remove();openSnooze(r)}; $('#toastArea').appendChild(t);
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

function showView(view){
  state.view=view;
  if(view!=='recipe') localStorage.setItem('atelierLastView',view);
  $$('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $(`#${view}View`).classList.add('active-view');
  const titles={home:'Accueil',calendar:'Calendrier',tasks:'Tâches',reminders:'Rappels',kitchen:'Courses & repas',cuisine:'Cuisine',recipe:'Recette'}; $('#pageTitle').textContent=titles[view]||'L’Atelier';
  document.body.classList.toggle('home-active',view==='home');
  if(view==='calendar') applyCalendarMode();
  syncGlobalLayoutEditing();
  render();
}
function setCalendarMode(mode){state.calendarMode=mode;applyCalendarMode();}
function applyCalendarMode(){
  $$('.calendar-modes button').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode===state.calendarMode));
  $$('.calendar-panel').forEach(p=>p.classList.remove('active-calendar-panel'));
  $(`#${state.calendarMode}Panel`).classList.add('active-calendar-panel');
}

$$('.tabs button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$$('.calendar-modes button').forEach(b=>b.addEventListener('click',()=>setCalendarMode(b.dataset.calendarMode)));
$('#openCalendarCard').onclick=()=>showView('calendar');
$('#openCalendarFromUpcoming').onclick=()=>showView('calendar');
$('#openTasksFromHome').onclick=()=>showView('tasks');
$('#prevMonth').onclick=()=>{state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1);refresh()}; $('#nextMonth').onclick=()=>{state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+1,1);refresh()};
$('#prevWeek').onclick=()=>{state.cursor.setDate(state.cursor.getDate()-7);state.cursor=new Date(state.cursor);refresh()}; $('#nextWeek').onclick=()=>{state.cursor.setDate(state.cursor.getDate()+7);state.cursor=new Date(state.cursor);refresh()};
$('#todayBtn').onclick=()=>{state.cursor=new Date();$('#jumpDate').value=ymd(state.cursor);if(state.view!=='home')showView('calendar');else refresh()};
$('#jumpDate').value=ymd(new Date()); $('#jumpDate').onchange=e=>{if(e.target.value){state.cursor=parseYMD(e.target.value);showView('calendar');refresh()}};
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
$('#notifyBtn').onclick=async()=>{ if(!('Notification' in window)){alert('Ce navigateur ne prend pas en charge les notifications.');return} await Notification.requestPermission(); syncNotifyButton(); };

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

let globalLayoutEditing=false;
let globalLayoutItems=[];

function getGlobalLayoutSpecs(){
  return [
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
}

function readGlobalLayout(item){
  try{
    const v=JSON.parse(localStorage.getItem(item.key));
    return v&&typeof v==='object'
      ? {x:Number(v.x)||0,y:Number(v.y)||0,scale:Number(v.scale)||1}
      : {x:0,y:0,scale:1};
  }catch(e){return{x:0,y:0,scale:1}}
}

function saveGlobalLayout(item,d){
  localStorage.setItem(item.key,JSON.stringify({x:d.x||0,y:d.y||0,scale:d.scale||1}));
}

function applyGlobalLayout(item,d){
  item.el.style.setProperty('--layout-x',(d.x||0)+'px');
  item.el.style.setProperty('--layout-y',(d.y||0)+'px');
  item.el.style.setProperty('--layout-scale',String(d.scale||1));
  const value=item.el.querySelector(':scope > .layout-controls .layout-scale-value');
  if(value)value.textContent=Math.round((d.scale||1)*100)+'%';
}

function syncGlobalLayoutEditing(){
  $$('.view').forEach(v=>v.classList.remove('layout-editing'));
  if(globalLayoutEditing){
    const view=$('#'+state.view+'View');
    if(view)view.classList.add('layout-editing');
  }
  const toggle=$('#globalLayoutEdit'), reset=$('#globalLayoutReset');
  if(toggle){
    toggle.textContent=globalLayoutEditing?'✓ Terminer':'Modifier';
    toggle.classList.toggle('is-active',globalLayoutEditing);
    toggle.setAttribute('aria-pressed',globalLayoutEditing?'true':'false');
  }
  if(reset)reset.classList.toggle('hidden',!globalLayoutEditing);
}

function initGlobalLayoutEditor(){
  globalLayoutItems=getGlobalLayoutSpecs();
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  globalLayoutItems.forEach(item=>{
    item.el.classList.add('layout-object');
    let controls=item.el.querySelector(':scope > .layout-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='layout-controls';
      controls.innerHTML='<span class="layout-move-handle">✥ Déplacer</span><span class="layout-scale-value">100%</span><span class="layout-resize-handle" title="Tirer le coin pour redimensionner">↘</span>';
      item.el.appendChild(controls);
    }
    applyGlobalLayout(item,readGlobalLayout(item));

    const beginMove=e=>{
      if(!globalLayoutEditing||state.view!==item.view||e.button!==0)return;
      if(e.target.closest('.layout-resize-handle'))return;
      e.preventDefault();e.stopPropagation();
      const d=readGlobalLayout(item),sx=e.clientX,sy=e.clientY,ox=d.x||0,oy=d.y||0;
      item.el.classList.add('layout-selected');
      const move=ev=>{d.x=ox+(ev.clientX-sx);d.y=oy+(ev.clientY-sy);applyGlobalLayout(item,d)};
      const up=()=>{saveGlobalLayout(item,d);item.el.classList.remove('layout-selected');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    };

    const beginResize=e=>{
      if(!globalLayoutEditing||state.view!==item.view||e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      const d=readGlobalLayout(item),start=d.scale||1,sx=e.clientX,sy=e.clientY;
      item.el.classList.add('layout-selected');
      const move=ev=>{
        const delta=((ev.clientX-sx)+(ev.clientY-sy))/700;
        d.scale=clamp(start+delta,.55,1.75);
        applyGlobalLayout(item,d);
      };
      const up=()=>{saveGlobalLayout(item,d);item.el.classList.remove('layout-selected');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    };

    item.el.addEventListener('pointerdown',beginMove);
    controls.querySelector('.layout-resize-handle').addEventListener('pointerdown',beginResize);
    item.el.addEventListener('click',e=>{
      if(globalLayoutEditing&&state.view===item.view&&!e.target.closest('.layout-controls')){
        e.preventDefault();e.stopImmediatePropagation();
      }
    },true);
  });

  $('#globalLayoutEdit').onclick=()=>{globalLayoutEditing=!globalLayoutEditing;syncGlobalLayoutEditing()};
  $('#globalLayoutReset').onclick=()=>{
    globalLayoutItems.filter(x=>x.view===state.view).forEach(item=>{
      const d={x:0,y:0,scale:1};
      saveGlobalLayout(item,d);applyGlobalLayout(item,d);
    });
  };
  syncGlobalLayoutEditing();
}

applyCalendarMode(); syncNotifyButton(); initGlobalLayoutEditor();
const savedView=localStorage.getItem('atelierLastView');
refresh().then(()=>{if(['home','calendar','tasks','reminders','kitchen','cuisine'].includes(savedView))showView(savedView)}); checkRuntimeCompatibility();
setInterval(checkDue,30000); setInterval(updateClock,30000); setTimeout(checkDue,1500);
let atelierLastDay=ymd(new Date());
setInterval(()=>{const d=ymd(new Date());if(d!==atelierLastDay){atelierLastDay=d;refresh();}},60000);