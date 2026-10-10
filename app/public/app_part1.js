const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { view:'home', calendarMode:'month', cursor:new Date(), events:[], tasks:[], reminders:[] };
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
  [state.events,state.tasks,state.reminders]=await Promise.all([
    api(`/api/events?start=${ymd(start)}&end=${ymd(end)}`), api('/api/tasks'), api('/api/reminders')
  ]);
  render();
}
function render(){ renderHome(); renderMonth(); renderWeek(); renderTasks(); renderReminders(); updateClock(); }

function renderHome(){
  const now=new Date(), today=ymd(now);
  $('#homeDate').textContent=fmtFrenchDate(now).replace(/^./,c=>c.toUpperCase());
  renderHomeMiniCalendar();

  const taskRoot=$('#homeTodayTasks'); taskRoot.innerHTML='';
  const todayTasks=state.tasks.filter(t=>!t.completed && (!t.due_date || t.due_date<=today)).slice(0,6);
  if(!todayTasks.length) taskRoot.innerHTML='<div class="home-empty">Rien à faire pour le moment c:</div>';
  todayTasks.forEach(t=>{
    const b=document.createElement('button'); b.type='button'; b.className='home-row';
    b.innerHTML=`<span class="home-row-time">${t.due_time?fmtTime(t.due_time):'☐'}</span><span><div class="home-row-title">${t.important?'👺 ':''}${esc(t.title)}</div><div class="home-row-meta">${t.due_date?fmtRelativeDate(t.due_date):'Sans date'}</div></span>`;
    b.addEventListener('click',()=>openTaskModal(t)); taskRoot.appendChild(b);
  });

  const upcomingRoot=$('#homeUpcoming'); upcomingRoot.innerHTML='';
  const upcoming=state.events.filter(e=>e.instance_date>=today && e.status!=='cancelled').sort((a,b)=>(a.instance_date+(a.start_time||'')).localeCompare(b.instance_date+(b.start_time||''))).slice(0,5);
  if(!upcoming.length) upcomingRoot.innerHTML='<div class="home-empty">Aucun rendez-vous à venir.</div>';
  upcoming.forEach(e=>{
    const b=document.createElement('button'); b.type='button'; b.className='home-row';
    const time=e.all_day?'Jour':(e.start_time?fmtTime(e.start_time):'—');
    b.innerHTML=`<span class="home-row-time">${time}</span><span><div class="home-row-title">${esc(e.title)}</div><div class="home-row-meta">${fmtRelativeDate(e.instance_date)}${e.location?' · '+esc(e.location):''}</div></span>`;
    b.addEventListener('click',()=>openEventModal(e)); upcomingRoot.appendChild(b);
  });

  const remRoot=$('#homeReminderPreview'); remRoot.innerHTML='';
  const reminders=state.reminders.slice(0,4);
  if(!reminders.length) remRoot.innerHTML='<div class="home-empty">Aucun rappel en attente.</div>';
  reminders.forEach(r=>{
    const b=document.createElement('button'); b.type='button'; b.className='home-row';
    const title=r.title || r.entity_title || `${r.entity_type==='event'?'Rendez-vous':'Tâche'} #${r.entity_id}`;
    b.innerHTML=`<span class="home-row-time">🔔</span><span><div class="home-row-title">${esc(title)}</div><div class="home-row-meta">${esc((r.snoozed_until||r.remind_at).replace('T',' '))}</div></span>`;
    b.addEventListener('click',()=>showView('reminders')); remRoot.appendChild(b);
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
