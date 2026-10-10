function renderMonth(){
  const y=state.cursor.getFullYear(), m=state.cursor.getMonth(); $('#monthTitle').textContent=`${months[m][0].toUpperCase()+months[m].slice(1)} ${y}`;
  const first=new Date(y,m,1), start=monday(first); const grid=$('#monthGrid'); grid.innerHTML='';
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=ymd(d); const cell=document.createElement('div'); cell.className='day-cell'+(d.getMonth()!==m?' outside':'')+(ds===ymd(new Date())?' today':'');
    cell.innerHTML=`<div class="day-number">${d.getDate()}</div><button class="day-add" title="Ajouter un rendez-vous">+</button>`;
    cell.querySelector('.day-add').addEventListener('click',()=>openEventModal(null,ds));
    const items=state.events.filter(e=>e.instance_date===ds && e.show_in_month).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    items.slice(0,3).forEach(e=>{
      const b=document.createElement('button'); b.className=`event-pill ${eventClass(e.category)}`; b.textContent=`${e.all_day?'':fmtTime(e.start_time)+' '}${e.title}`; b.addEventListener('click',()=>openEventModal(e)); cell.appendChild(b);
    });
    if(items.length>3){ const more=document.createElement('button'); more.className='more-btn'; more.textContent=`+ ${items.length-3} autre${items.length-3>1?'s':''}`; more.addEventListener('click',()=>openDayList(ds,items)); cell.appendChild(more); }
    cell.title='Double-clique pour ajouter un rendez-vous';
    cell.addEventListener('dblclick',ev=>{ if(ev.target.closest('button')) return; state.cursor=new Date(d); openEventModal(null,ds); });
    grid.appendChild(cell);
  }
}

function renderMiniMonth(){
  const y=state.cursor.getFullYear(),m=state.cursor.getMonth(); const root=$('#miniMonth'); root.innerHTML='';
  days.forEach(x=>{const d=document.createElement('div');d.textContent=x[0];d.style.color='var(--muted)';d.style.textAlign='center';root.appendChild(d)});
  const first=new Date(y,m,1), offset=(first.getDay()+6)%7; for(let i=0;i<offset;i++) root.appendChild(document.createElement('div'));
  const n=new Date(y,m+1,0).getDate(); for(let i=1;i<=n;i++){ const d=new Date(y,m,i), el=document.createElement('button'); el.className='mday'+(ymd(d)===ymd(new Date())?' today':'')+(ymd(d)===ymd(state.cursor)?' selected':'');el.textContent=i;el.addEventListener('click',()=>{state.cursor=d;renderWeek();renderMonth();});root.appendChild(el); }
}
function renderWeek(){
  const start=monday(state.cursor), end=sunday(state.cursor); $('#weekTitle').textContent=`${start.getDate()} ${months[start.getMonth()].slice(0,3)} — ${end.getDate()} ${months[end.getMonth()].slice(0,3)}`; renderMiniMonth();
  const grid=$('#weekGrid'); grid.innerHTML=''; const blank=document.createElement('div'); blank.className='week-head'; grid.appendChild(blank);
  for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const h=document.createElement('div');h.className='week-head';h.innerHTML=`<strong>${days[i]}</strong><br>${d.getDate()}/${pad(d.getMonth()+1)}`;grid.appendChild(h)}
  for(let hour=7;hour<=22;hour++){
    const tl=document.createElement('div');tl.className='time-label';tl.textContent=`${pad(hour)}:00`;grid.appendChild(tl);
    for(let i=0;i<7;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const ds=ymd(d);const cell=document.createElement('div');cell.className='week-slot';
      const events=state.events.filter(e=>e.instance_date===ds && (e.all_day || !e.start_time ? hour===7 : Number(e.start_time.slice(0,2))===hour));
      const tasks=state.tasks.filter(t=>!t.completed && t.due_date===ds && t.due_time && Number(t.due_time.slice(0,2))===hour);
      if(events.length+tasks.length>2) cell.classList.add('has-many');
      events.forEach(e=>{const b=document.createElement('button');b.className=`week-item ${eventClass(e.category)}`;b.textContent=`${e.all_day?'Toute la journée':fmtTime(e.start_time)} ${e.title}`;b.addEventListener('click',()=>openEventModal(e));cell.appendChild(b)});
      tasks.forEach(t=>{const b=document.createElement('button');b.className='week-item week-task';b.textContent=`☐ ${t.title}`;b.addEventListener('click',()=>openTaskModal(t));cell.appendChild(b)});
      cell.addEventListener('dblclick',()=>openEventModal(null,ds,`${pad(hour)}:00`)); grid.appendChild(cell);
    }
  }
}

function renderTasks(){
  const root=$('#taskList'); root.innerHTML=''; if(!state.tasks.length){root.innerHTML='<div class="empty">Le petit carnet est vide pour le moment.</div>';return}
  const sorted=[...state.tasks].sort((a,b)=>a.completed-b.completed || b.important-a.important || (a.order_index-b.order_index));
  sorted.forEach(t=>{
    const row=document.createElement('div');row.className='task-row'+(t.completed?' done':'');
    row.innerHTML=`<input type="checkbox" ${t.completed?'checked':''} aria-label="Terminer"><div><div class="task-title">${t.important?'👺 ':''}${esc(t.title)}</div><div class="task-meta">${t.due_date?esc(t.due_date):'Sans date'}${t.due_time?' · '+fmtTime(t.due_time):''}</div></div><div class="task-actions"><button class="edit">Modifier</button><button class="up">↑</button><button class="down">↓</button><button class="archive">Archiver</button></div>`;
    row.querySelector('input').addEventListener('change',async e=>{await api(`/api/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({completed:e.target.checked})});await refresh()});
    row.querySelector('.edit').addEventListener('click',()=>openTaskModal(t));
    row.querySelector('.archive').addEventListener('click',async()=>{await api(`/api/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({archived:true})});await refresh()});
    row.querySelector('.up').addEventListener('click',()=>moveTask(t,-1)); row.querySelector('.down').addEventListener('click',()=>moveTask(t,1)); root.appendChild(row);
  });
}
async function moveTask(t,dir){ const active=state.tasks.filter(x=>!x.completed).sort((a,b)=>a.order_index-b.order_index); const i=active.findIndex(x=>x.id===t.id), j=i+dir;if(i<0||j<0||j>=active.length)return; const a=active[i],b=active[j]; await Promise.all([api(`/api/tasks/${a.id}`,{method:'PUT',body:JSON.stringify({order_index:b.order_index})}),api(`/api/tasks/${b.id}`,{method:'PUT',body:JSON.stringify({order_index:a.order_index})})]); await refresh(); }

function renderReminders(){
  const root=$('#reminderList'); root.innerHTML=''; if(!state.reminders.length){root.innerHTML='<div class="empty">Aucun rappel non traité.</div>';return}
  state.reminders.forEach(r=>{const row=document.createElement('div');row.className='reminder-row';const title=r.title||r.entity_title||`${r.entity_type==='event'?'Rendez-vous':'Tâche'} #${r.entity_id}`;row.innerHTML=`<span>🔔</span><div><strong>${esc(title)}</strong><div class="task-meta">${esc((r.snoozed_until||r.remind_at).replace('T',' '))}</div></div><div class="reminder-actions"><button class="done">Fini</button><button class="snooze">Reporter</button></div>`;row.querySelector('.done').addEventListener('click',async()=>{await api(`/api/reminders/${r.id}/finish`,{method:'PUT',body:'{}'});await refresh()});row.querySelector('.snooze').addEventListener('click',()=>openSnooze(r));root.appendChild(row)});
}

function openDayList(ds,items){ openModal(`<h2>${ds}</h2><div class="task-list">${items.map(e=>`<button class="event-pill ${eventClass(e.category)}" data-eid="${e.id}">${e.start_time?fmtTime(e.start_time)+' ':''}${esc(e.title)}</button>`).join('')}</div>`); $$('#modalBody [data-eid]').forEach(b=>b.addEventListener('click',()=>{const e=state.events.find(x=>x.id===Number(b.dataset.eid));openEventModal(e)})); }
function openModal(html){$('#modalBody').innerHTML=html;$('#modalBackdrop').classList.remove('hidden')}
function closeModal(){$('#modalBackdrop').classList.add('hidden');$('#modalBody').innerHTML=''}

function reminderEditor(existing=[], fallbackLabel='élément', defaultDate=''){ return `<div class="field full"><label>Rappels</label><div class="field-help">Laisse le nom vide : le rappel reprendra automatiquement le nom de ${fallbackLabel}. La date et l’heure sont séparées pour pouvoir les taper directement.</div><div id="reminderEditor" data-default-date="${esc(defaultDate)}">${existing.map(v=>reminderRow(v,defaultDate)).join('')}</div><button type="button" id="addReminder">+ Ajouter un rappel</button></div>`; }
function reminderRow(v={},defaultDate=''){ const r=typeof v==='string'?{remind_at:v,title:''}:v||{}; const raw=(r.remind_at||r.snoozed_until||'').slice(0,16); const d=raw.slice(0,10)||defaultDate||ymd(new Date()); const t=raw.length>=16?raw.slice(11,16):''; return `<div class="reminder-row-edit"><input class="reminder-name" type="text" placeholder="Nom personnalisé (facultatif)" value="${esc(r.title||'')}"><input class="reminder-date" type="date" value="${esc(d)}"><input class="reminder-time" type="time" value="${esc(t)}"><button type="button" class="remove-rem">×</button></div>`; }
function wireReminderEditor(){ const ed=$('#reminderEditor'); const defaultDate=ed?.dataset.defaultDate||''; $('#addReminder')?.addEventListener('click',()=>{ed.insertAdjacentHTML('beforeend',reminderRow({},defaultDate)); wireRemoveRem()}); wireRemoveRem(); }
function wireRemoveRem(){ $('#reminderEditor .remove-rem').forEach(b=>b.onclick=()=>b.parentElement.remove()); }
function collectReminders(){ return $('#reminderEditor .reminder-row-edit').map(row=>{const d=row.querySelector('.reminder-date').value; const t=row.querySelector('.reminder-time').value; return {title:row.querySelector('.reminder-name').value.trim(),remind_at:(d&&t)?`${d}T${t}`:''};}).filter(r=>r.remind_at); }
