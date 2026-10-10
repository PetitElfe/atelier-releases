const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { view:'home', calendarMode:'month', cursor:new Date(), events:[], tasks:[], reminders:[], shopping:[], foods:[], meals:[] };
const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const api = async (url, opts={}) => { const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); if(!r.ok) throw new Error(await r.text()); return r.json(); };
function parseYMD(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function monday(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function sunday(d){ const x=monday(d); x.setDate(x.getDate()+6); return x; }
function esc(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function eventClass(c){ return c==='medical'?'event-medical':c==='important'?'event-important':'event-general'; }
function eventInstanceClosed(e){ return !!e.instance_done || e.instance_action==='postponed' || e.instance_action==='cancelled'; }
function eventInstanceIcon(e){ return e.instance_done?'✓':e.instance_action==='postponed'?'↪':e.instance_action==='cancelled'?'×':''; }
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
    ['shopping',api('/api/shopping')],
    ['foods',api('/api/foods')],
    ['meals',api('/api/meals')]
  ];
  const results=await Promise.allSettled(reqs.map(x=>x[1]));
  results.forEach((r,i)=>{if(r.status==='fulfilled')state[reqs[i][0]]=r.value;});
  render();
}
function render(){ renderHome(); renderMonth(); renderWeek(); renderTasks(); renderReminders(); renderKitchen(); updateClock(); }

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
      b.innerHTML=`<span class="deadline-tag">${esc(fmtRelativeDate(d.date))}</span><span>${esc(d.title)}</span>`;
      b.addEventListener('click',()=>d.type==='task'?openTaskModal(d.item):openEventModal(d.item)); deadlineRoot.appendChild(b);
    });
    for(let i=deadlines.length;i<3;i++){ const blank=document.createElement('div'); blank.className='deadline-empty'; blank.innerHTML='&nbsp;'; deadlineRoot.appendChild(blank); }
  }

  const taskRoot=$('#homeTodayTasks'); taskRoot.innerHTML='';
  const todayTasks=state.tasks.filter(t=>!t.completed && (!t.due_date || t.due_date<=today)).slice(0,10);
  if(!todayTasks.length) taskRoot.innerHTML='<div class="journal-empty">Rien à faire pour le moment c:</div>';
  todayTasks.forEach(t=>{
    const b=document.createElement('button'); b.type='button'; b.className='journal-task';
    b.innerHTML=`<span class="journal-task-mark">${t.important?'✦':'☐'}</span><span class="journal-task-title">${esc(t.title)}</span><span class="journal-task-time">${t.due_time?fmtTime(t.due_time):''}</span>`;
    b.addEventListener('click',()=>openTaskModal(t)); taskRoot.appendChild(b);
  });

  const objectiveRoot=$('#homeObjectiveSuggestions'); objectiveRoot.innerHTML='';
  const objectiveSeeds=[
    ['Anglais','Reprendre là où tu t’es arrêtée.'],
    ['League of Legends','Une petite action vaut mieux qu’un énorme bloc.'],
    ['Art','Garder une trace de l’idée du moment.'],
    ['JDR','Avancer sur un détail concret.'],
    ['Maison','Choisir une chose simple à régler.']
  ];
  objectiveSeeds.forEach(([name,context])=>{
    const el=document.createElement('div'); el.className='objective-note';
    el.innerHTML=`<div class="objective-name">${esc(name)}</div><div class="objective-context">${esc(context)}</div><ul class="objective-actions"><li>Ajouter une petite action…</li></ul>`;
    objectiveRoot.appendChild(el);
  });

  const mealRoot=$('#homeMealIdeas'); mealRoot.innerHTML='';
  const meals=state.meals.slice(0,3);
  if(!meals.length) mealRoot.innerHTML='<button class="meal-line meal-line-button" type="button">Ajouter une idée de repas…</button>';
  meals.forEach(m=>{
    const b=document.createElement('button'); b.type='button'; b.className='meal-line meal-line-button';
    b.textContent=m.title; b.addEventListener('click',()=>openMealRecipeModal(m)); mealRoot.appendChild(b);
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
  const upcoming=state.events.filter(e=>e.instance_date>=today && e.status!=='cancelled').sort((a,b)=>(a.instance_date+(a.start_time||'')).localeCompare(b.instance_date+(b.start_time||''))).slice(0,3);
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
      done.onclick=async()=>{await api(`/api/events/${e.id}/complete-instance`,{method:'PUT',body:JSON.stringify({instance_date:e.instance_date,done:true})});await refresh()};
      const postpone=document.createElement('button'); postpone.type='button'; postpone.className='appt-action postpone'; postpone.title='Reporter'; postpone.textContent='↪';
      postpone.onclick=()=>openPostponeEventModal(e);
      const cancel=document.createElement('button'); cancel.type='button'; cancel.className='appt-action cancel'; cancel.title='Annuler'; cancel.textContent='×';
      cancel.onclick=async()=>{await api(`/api/events/${e.id}/instance-action`,{method:'PUT',body:JSON.stringify({instance_date:e.instance_date,action:'cancelled'})});await refresh()};
      actions.append(done,postpone,cancel);
    }
    row.append(main,actions); upcomingRoot.appendChild(row);
  });

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
