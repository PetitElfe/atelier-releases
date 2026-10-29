const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { view:'home', calendarMode:'month', cursor:new Date(), events:[], tasks:[], reminders:[], shopping:[], foods:[], recipeBooks:[], recipes:[], mealIdeas:[], objectiveNodes:[], preparationsUpcoming:[] };
const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const api = async (url, opts={}) => {
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});
  const raw=await r.text();
  let data={};
  try{data=raw?JSON.parse(raw):{}}catch(e){data={raw}}
  if(!r.ok){
    const err=new Error(data.error||data.detail||raw||`Erreur HTTP ${r.status}`);
    err.status=r.status; err.data=data; throw err;
  }
  return data;
};
function showUiError(err,prefix='Une erreur est survenue'){
  const msg=(err&&err.message)?err.message:String(err||'Erreur inconnue');
  const area=$('#toastArea');
  if(!area){console.error(prefix+': '+msg);return}
  const t=document.createElement('div');
  t.className='toast error-toast';
  t.innerHTML=`<strong>⚠ ${esc(prefix)}</strong><div class="task-meta">${esc(msg)}</div>`;
  area.appendChild(t);
  setTimeout(()=>t.remove(),6500);
}
async function runUiAction(label,fn){
  try{return {ok:true,value:await fn()}}
  catch(err){showUiError(err,label);return {ok:false,error:err}}
}
function parseYMD(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function monday(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function sunday(d){ const x=monday(d); x.setDate(x.getDate()+6); return x; }
function esc(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function eventClass(event){
  const category=typeof event==='string'?event:(event?.category||'general');
  const color=typeof event==='string'?'auto':(event?.color||'auto');
  const categoryClass=category==='medical'?'event-medical':category==='important'?'event-important':'event-general';
  const allowed=['sage','mauve','gold','red','pink','blue','peach','cream','deep-blue','deep-green'];
  return categoryClass+(allowed.includes(color)?' event-color-'+color:'');
}
function eventInstanceClosed(e){ return !!e.instance_done || e.instance_action==='postponed' || e.instance_action==='cancelled' || e.status==='done' || e.status==='cancelled'; }
function eventInstanceIcon(e){ return (e.instance_done||e.status==='done')?'✓':e.instance_action==='postponed'?'↪':(e.instance_action==='cancelled'||e.status==='cancelled')?'×':''; }
function fmtTime(t){ return t ? t.replace(':','h') : ''; }
function fmtFrenchDate(d){ return d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
function fmtRelativeDate(s){
  if(!s) return '';
  const d=parseYMD(s), today=parseYMD(ymd(new Date()));
  const diff=Math.round((d-today)/86400000);
  if(diff===0) return "Aujourd’hui";
  if(diff===1) return 'Demain';
  if(diff===-1) return 'Hier';
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
}

async function refresh(){
  const start=new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1), end=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+2,0);
  const reqs=[
    ['events',api(`/api/events?start=${ymd(start)}&end=${ymd(end)}`)],
    ['tasks',api('/api/tasks')],
    ['reminders',api('/api/reminders')],
    ['preparationsUpcoming',api('/api/preparations/upcoming')],
    ['shopping',api('/api/shopping')],
    ['foods',api('/api/foods')],
    ['recipeBooks',api('/api/recipe-books')],
    ['recipes',api('/api/recipes')],
    ['mealIdeas',api('/api/meal-ideas')],
    ['objectiveNodes',api('/api/objective-nodes')]
  ];
  const results=await Promise.allSettled(reqs.map(x=>x[1]));
  results.forEach((r,i)=>{if(r.status==='fulfilled')state[reqs[i][0]]=r.value;});
  render();
}
function render(){ renderHome(); renderMonth(); renderWeek(); renderTasks(); renderReminders(); renderKitchen(); renderCuisineLibrary(); if(typeof renderLibrary==='function'&&state.view==='library'&&!window.__atelierLibraryViewRestoring)renderLibrary(); updateClock(); }

function renderHome(){
  const now=new Date(), today=ymd(now);
  $('#homeDate').textContent=fmtFrenchDate(now).replace(/^./,c=>c.toUpperCase());
  renderHomeMiniCalendar();

  const deadlineRoot=$('#homeDeadlineLines'); deadlineRoot.innerHTML='';
  const urgentTasks=state.tasks.filter(t=>!t.completed&&t.important&&t.due_date).map(t=>({type:'task',date:t.due_date,title:t.title,item:t}));
  const urgentEvents=state.events.filter(e=>e.status!=='cancelled'&&!eventInstanceClosed(e)&&e.category==='important'&&e.instance_date>=today).map(e=>({type:'event',date:e.instance_date,title:e.title,item:e}));
  const deadlines=[...urgentTasks,...urgentEvents].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
  if(!deadlines.length){
    deadlineRoot.innerHTML='<div class="deadline-empty">Rien d’urgent pour le moment.</div><div class="deadline-empty">&nbsp;</div><div class="deadline-empty">&nbsp;</div>';
  }else{
    deadlines.forEach(d=>{
      const b=document.createElement('button'); b.type='button'; b.className='deadline-line';
      const time=d.type==='event'&&d.item?.start_time?fmtTime(d.item.start_time)+(d.item.end_time?'–'+fmtTime(d.item.end_time):''):d.item?.due_time?fmtTime(d.item.due_time):'';
      b.innerHTML=`<span class="deadline-tag">${esc(fmtRelativeDate(d.date))}</span><span class="deadline-text">${esc(d.title)}</span><span class="deadline-time">${esc(time)}</span>`;
      b.addEventListener('click',()=>d.type==='task'?openTaskModal(d.item):openEventModal(d.item)); deadlineRoot.appendChild(b);
    });
    for(let i=deadlines.length;i<3;i++){ const blank=document.createElement('div'); blank.className='deadline-empty'; blank.innerHTML='&nbsp;'; deadlineRoot.appendChild(blank); }
  }

  const taskRoot=$('#homeTodayTasks'); taskRoot.innerHTML='';
  // Une tâche cochée sur cette page reste lisible jusqu'au lendemain.
  // La clé du jour n'affecte ni les tâches historiques ni le serveur.
  const completedTodayKey='atelierHomeCompletedOn_'+today;
  let checkedToday=[];
  try{const stored=JSON.parse(localStorage.getItem(completedTodayKey)||'[]');
      checkedToday=Array.isArray(stored)?stored.map(Number):[];}catch(_){}
  const keptToday=new Set(checkedToday);
  const todayTasks=state.tasks.filter(t=>(!t.due_date || t.due_date<=today)&&
    (!t.completed || t.due_date===today || keptToday.has(Number(t.id))))
    .sort((a,b)=>Number(a.completed)-Number(b.completed))
    .slice(0,10);
  if(!todayTasks.length) taskRoot.innerHTML='<div class="journal-empty">Rien à faire pour le moment c:</div>';
  todayTasks.forEach(t=>{
    const row=document.createElement('div');row.className='journal-task journal-task-interactive'+(t.completed?' is-completed':'');
    const check=document.createElement('input');check.type='checkbox';check.className='journal-task-check';
    check.checked=!!t.completed;
    check.setAttribute('aria-label','Terminer : '+t.title);
    check.addEventListener('change',async()=>{
      check.disabled=true;
      const requested=check.checked;
      const result=await runUiAction('Impossible de cocher la tâche',()=>api('/api/tasks/'+t.id,{method:'PUT',body:JSON.stringify({completed:requested})}));
      if(result.ok){
        const next=new Set(keptToday);
        if(requested)next.add(Number(t.id));else next.delete(Number(t.id));
        localStorage.setItem(completedTodayKey,JSON.stringify([...next]));
        await refresh();
      }else{check.checked=!requested;check.disabled=false}
    });
    const title=document.createElement('button');title.type='button';title.className='journal-task-open';
    title.textContent=(t.important?'✦ ':'')+t.title;title.title='Modifier la tâche';
    title.onclick=()=>openTaskModal(t);
    const time=document.createElement('span');time.className='journal-task-time';time.textContent=t.due_time?fmtTime(t.due_time):'';
    row.append(check,title,time);taskRoot.appendChild(row);
  });

  // La To-do list de gauche reflète les mêmes tâches que le carnet.
  // Aucune seconde base de tâches : chaque coche passe par /api/tasks et refresh().
  const preview=$('#homeTodoPreview');
  if(preview){
    preview.replaceChildren();
    for(const task of todayTasks.slice(0,6)){
      const line=document.createElement('div');line.className='home-todo-row'+(task.completed?' is-done':'');
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!task.completed;
      checkbox.setAttribute('aria-label','Terminer : '+task.title);
      checkbox.onchange=async()=>{
        const requested=checkbox.checked;checkbox.disabled=true;
        const result=await runUiAction('Impossible de modifier la tâche',()=>api('/api/tasks/'+task.id,{
          method:'PUT',body:JSON.stringify({completed:requested})}));
        if(result.ok){
          const next=new Set(keptToday);
          if(requested)next.add(Number(task.id));else next.delete(Number(task.id));
          localStorage.setItem(completedTodayKey,JSON.stringify([...next]));
          await refresh();
        }else{checkbox.checked=!requested;checkbox.disabled=false}
      };
      const title=document.createElement('button');title.type='button';title.textContent=task.title;
      title.onclick=()=>openTaskModal(task);line.append(checkbox,title);preview.append(line);
    }
    if(!todayTasks.length){const empty=document.createElement('p');empty.textContent='Rien à faire pour aujourd’hui c:';preview.append(empty)}
  }
  const objectiveRoot=$('#homeObjectiveSuggestions'); objectiveRoot.innerHTML='';
  const allObjectives=$('#homeAllObjectives');
  if(allObjectives)allObjectives.onclick=()=>showView('library');
  const activeObjectives=state.objectiveNodes
    .filter(x=>x.node_type==='objective'&&x.status!=='done')
    .sort((a,b)=>(a.order_index-b.order_index)||a.id-b.id)
    .slice(0,3);
  if(!activeObjectives.length){
    const empty=document.createElement('button');
    empty.type='button';empty.className='objective-note objective-open';
    empty.innerHTML='<div class="objective-name">Créer ta bibliothèque</div><div class="objective-context">Crée un domaine puis organise ses carnets, ses sous-objectifs et ses tâches.</div><ul class="objective-actions"><li>Ouvrir la bibliothèque →</li></ul>';
    empty.addEventListener('click',()=>showView('library'));
    objectiveRoot.appendChild(empty);
  }else{
    activeObjectives.forEach(obj=>{
      const el=document.createElement('button');
      el.type='button';el.className='objective-note objective-open';
      const context=(obj.description||'').trim()||`${Number(obj.progress)||0}% d’avancement`;
      const percent=Math.max(0,Math.min(100,Number(obj.progress)||0));
      el.innerHTML=`<div class="objective-name">${esc(obj.title)}</div><div class="objective-context">${esc(context)}</div><div class="objective-progress-line"><span class="objective-progress-track"><i style="width:${percent}%"></i></span><span class="objective-percent">${percent}%</span></div>`;
      el.addEventListener('click',()=>openLibraryForNode(obj.id));
      objectiveRoot.appendChild(el);
    });
  }

  const mealRoot=$('#homeMealIdeas'); mealRoot.innerHTML='';
  const meals=state.mealIdeas.slice(0,3);
  if(!meals.length){
    const addMeal=document.createElement('button');
    addMeal.className='meal-line meal-line-button';
    addMeal.type='button';
    addMeal.textContent='Choisir une idée depuis la bibliothèque…';
    addMeal.addEventListener('click',()=>openMealIdeaPicker());
    mealRoot.appendChild(addMeal);
  }
  meals.forEach(m=>{
    const b=document.createElement('button'); b.type='button'; b.className='meal-line meal-line-button';
    b.textContent=m.title; b.addEventListener('click',()=>openRecipePage(m)); mealRoot.appendChild(b);
  });

  const expiryBlock=$('#homeExpiryBlock'), expiryList=$('#homeExpiryList'); expiryList.innerHTML='';
  const todayDate=parseYMD(today);
  const expiring=state.foods.filter(f=>{
    if(!f.expiry_date) return false;
    const diff=Math.round((parseYMD(f.expiry_date)-todayDate)/86400000);
    return diff<=3;
  }).sort((a,b)=>(a.expiry_date||'9999').localeCompare(b.expiry_date||'9999'));
  expiryBlock.classList.toggle('hidden',!expiring.length);
  expiring.slice(0,4).forEach(f=>{
    const diff=Math.round((parseYMD(f.expiry_date)-todayDate)/86400000);
    const label=diff<0?'Périmé':diff===0?"Aujourd’hui":`J-${diff}`;
    const b=document.createElement('button'); b.type='button'; b.className='meal-line meal-line-button expiry-line';
    b.innerHTML=`<span>${esc(f.name)}</span><strong>${label}</strong>`; b.addEventListener('click',()=>openFoodModal(f)); expiryList.appendChild(b);
  });

  const upcomingRoot=$('#homeUpcoming'); upcomingRoot.innerHTML='';
  const upcomingAll=state.events.filter(e=>e.instance_date>=today && e.status!=='cancelled').sort((a,b)=>(a.instance_date+(a.start_time||'')).localeCompare(b.instance_date+(b.start_time||'')));
  const expanded=upcomingRoot.dataset.expanded==='1';
  // En affichage étendu, passer au premier plan sans déplacer le module.
  $('#homeUpcomingWidget')?.classList.toggle('home-upcoming-expanded',expanded);
  const upcoming=expanded?upcomingAll:upcomingAll.slice(0,3);
  if(!upcoming.length) upcomingRoot.innerHTML='<div class="home-empty">Aucun rendez-vous à venir.</div>';
  upcoming.forEach(e=>{
    const row=document.createElement('div');
    const closed=eventInstanceClosed(e);
    row.className='home-appt-row'+(closed?' is-closed':'')+(e.instance_action?' is-'+e.instance_action:'')+(e.instance_done?' is-done':'');
    const main=document.createElement('button'); main.type='button'; main.className='home-row home-appt-main';
    const time=e.all_day?'Jour':(e.start_time?fmtTime(e.start_time):'—');
    main.innerHTML=`<span class="home-row-time">${time}</span><span><div class="home-row-title">${esc(e.title)}</div><div class="home-row-meta">${fmtRelativeDate(e.instance_date)}${e.location?' · '+esc(e.location):''}</div></span>`;
    main.addEventListener('click',()=>openEventModal(e));
    const actions=document.createElement('div'); actions.className='home-appt-actions';
    if(closed){
      const mark=document.createElement('span'); mark.className='home-appt-state'; mark.textContent=eventInstanceIcon(e); actions.appendChild(mark);
    }else{
      const done=document.createElement('button'); done.type='button'; done.className='appt-action done'; done.title='Effectué'; done.textContent='✓';
      done.onclick=async()=>{
        done.disabled=true;
        try{
          await api(`/api/events/${e.id}/complete-instance`,{method:'PUT',body:JSON.stringify({instance_date:e.instance_date,done:true})});
          await refresh();
        }catch(err){showUiError(err,'Impossible de valider le rendez-vous');done.disabled=false}
      };
      const postpone=document.createElement('button'); postpone.type='button'; postpone.className='appt-action postpone'; postpone.title='Reporter'; postpone.textContent='↪';
      postpone.onclick=()=>openPostponeEventModal(e);
      const cancel=document.createElement('button'); cancel.type='button'; cancel.className='appt-action cancel'; cancel.title='Annuler'; cancel.textContent='×';
      cancel.onclick=async()=>{
        cancel.disabled=true;
        try{
          await api(`/api/events/${e.id}/cancel-instance`,{method:'PUT',body:JSON.stringify({instance_date:e.instance_date})});
          await refresh();
        }catch(err){showUiError(err,"Impossible d’annuler le rendez-vous");cancel.disabled=false}
      };
      actions.append(done,postpone,cancel);
    }
    row.append(main,actions); upcomingRoot.appendChild(row);

  });
  if(upcomingAll.length>3){
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='home-upcoming-toggle';
    toggle.textContent=expanded?'⌃  Réduire la liste':'⌄  Voir les '+upcomingAll.length+' rendez-vous';
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.setAttribute('aria-label',expanded?'Réduire les rendez-vous à venir':'Afficher tous les '+upcomingAll.length+' rendez-vous');
    toggle.addEventListener('click',()=>{
      upcomingRoot.dataset.expanded=expanded?'0':'1';
      renderHome();
    });
    upcomingRoot.appendChild(toggle);
  }
  upcomingRoot.style.maxHeight=expanded?'min(50vh,370px)':'';
  upcomingRoot.style.overflowY=expanded?'auto':'';

}

function renderHomeMiniCalendar(){
  const root=$('#homeMiniCalendar'); root.innerHTML='';
  days.forEach(x=>{const e=document.createElement('div');e.className='dow';e.textContent=x[0];root.appendChild(e)});
  const now=new Date(), y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1), start=monday(first);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=ymd(d); const e=document.createElement('div');
    const hasEvent=state.events.some(x=>x.instance_date===ds && x.show_in_month);
    e.className='hday'+(d.getMonth()!==m?' outside':'')+(ds===ymd(now)?' today':'')+(hasEvent?' has-event':''); e.textContent=d.getDate(); root.appendChild(e);
  }
}
function updateClock(){ const el=$('#homeClock'); if(el) el.textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }
