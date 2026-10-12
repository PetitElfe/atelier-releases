function renderMonth(){
  const y=state.cursor.getFullYear(), m=state.cursor.getMonth(); $('#monthTitle').textContent=`${months[m][0].toUpperCase()+months[m].slice(1)} ${y}`;
  const first=new Date(y,m,1), start=monday(first); const grid=$('#monthGrid'); grid.innerHTML='';
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=ymd(d); const cell=document.createElement('div'); cell.className='day-cell'+(d.getMonth()!==m?' outside':'')+(ds===ymd(new Date())?' today':'');
    cell.innerHTML=`<div class="day-number">${d.getDate()}</div><button class="day-add" title="Ajouter un rendez-vous">+</button>`;
    cell.querySelector('.day-add').addEventListener('click',()=>openEventModal(null,ds));
    const items=state.events.filter(e=>e.instance_date===ds && e.show_in_month).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    items.slice(0,3).forEach(e=>{
      const b=document.createElement('button'); b.className=`event-pill ${eventClass(e.category)}${eventInstanceClosed(e)?' event-instance-closed':''}`; const mark=eventInstanceIcon(e); b.textContent=`${mark?mark+' ':''}${e.all_day?'':fmtTime(e.start_time)+' '}${e.title}`; b.addEventListener('click',()=>openEventModal(e)); cell.appendChild(b);
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
      events.forEach(e=>{const b=document.createElement('button');b.className=`week-item ${eventClass(e.category)}${eventInstanceClosed(e)?' event-instance-closed':''}`;const mark=eventInstanceIcon(e);b.textContent=`${mark?mark+' ':''}${e.all_day?'Toute la journée':fmtTime(e.start_time)} ${e.title}`;b.addEventListener('click',()=>openEventModal(e));cell.appendChild(b)});
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
    row.innerHTML=`<input type="checkbox" ${t.completed?'checked':''} aria-label="Terminer"><div><div class="task-title">${t.important?'👺 ':''}${esc(t.title)}</div><div class="task-meta">${t.due_date?esc(t.due_date):'Sans date'}${t.due_time?' · '+fmtTime(t.due_time):''}${t.objective_title?' · 🎯 '+esc(t.objective_title):''}</div></div><div class="task-actions"><button class="edit">Modifier</button><button class="up">↑</button><button class="down">↓</button><button class="archive">Archiver</button></div>`;
    row.querySelector('input').addEventListener('change',async e=>{await api(`/api/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({completed:e.target.checked})});await refresh()});
    row.querySelector('.edit').addEventListener('click',()=>openTaskModal(t));
    row.querySelector('.archive').addEventListener('click',async()=>{await api(`/api/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({archived:true})});await refresh()});
    row.querySelector('.up').addEventListener('click',()=>moveTask(t,-1)); row.querySelector('.down').addEventListener('click',()=>moveTask(t,1)); root.appendChild(row);
  });
}
async function moveTask(t,dir){ const active=state.tasks.filter(x=>!x.completed).sort((a,b)=>a.order_index-b.order_index); const i=active.findIndex(x=>x.id===t.id), j=i+dir;if(i<0||j<0||j>=active.length)return; const a=active[i],b=active[j]; await Promise.all([api(`/api/tasks/${a.id}`,{method:'PUT',body:JSON.stringify({order_index:b.order_index})}),api(`/api/tasks/${b.id}`,{method:'PUT',body:JSON.stringify({order_index:a.order_index})})]); await refresh(); }

function reminderKindLabel(r){
  return r.entity_type==='standalone'?'Rappel indépendant':r.entity_type==='event'?'Lié à un rendez-vous':'Lié à une tâche';
}

function formatReminderMoment(raw){
  if(!raw)return '';
  const datePart=raw.slice(0,10), timePart=raw.length>=16?raw.slice(11,16):'';
  const d=parseYMD(datePart);
  const dateLabel=d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  return timePart?`${dateLabel} à ${timePart.replace(':','h')}`:dateLabel;
}

function renderReminders(){
  const root=$('#reminderList');
  root.innerHTML='';
  if(!state.reminders.length){
    root.innerHTML='<div class="empty">Aucun rappel non traité. Tu peux en créer un avec « + Ajouter un rappel ».</div>';
    return;
  }
  state.reminders.forEach(r=>{
    const row=document.createElement('div');
    row.className='reminder-row'+(r.entity_type==='standalone'?' reminder-standalone':'');
    const title=r.title||r.entity_title||`${r.entity_type==='event'?'Rendez-vous':r.entity_type==='task'?'Tâche':'Rappel'} #${r.id}`;
    const kind=reminderKindLabel(r);
    const when=formatReminderMoment(r.snoozed_until||r.remind_at);
    row.innerHTML=`<span>🔔</span><div><strong>${esc(title)}</strong><div class="task-meta">${esc(when)} · ${esc(kind)}</div></div><div class="reminder-actions">
      <button class="done reminder-icon-action" type="button" title="Fini" aria-label="Fini">✓</button>
      <button class="snooze reminder-icon-action" type="button" title="Reporter" aria-label="Reporter">↪</button>
      <button class="edit reminder-icon-action" type="button" title="Modifier" aria-label="Modifier">✎</button>
      <button class="delete reminder-icon-action" type="button" title="Supprimer" aria-label="Supprimer">×</button>
    </div>`;
    row.querySelector('.done').addEventListener('click',async()=>{
      await api(`/api/reminders/${r.id}/done`,{method:'PUT',body:'{}'});
      shown.delete(r.id);
      await refresh();
    });
    row.querySelector('.snooze').addEventListener('click',()=>openSnooze(r));
    row.querySelector('.edit').addEventListener('click',()=>openReminderModal(r));
    row.querySelector('.delete').addEventListener('click',async()=>{
      const ok=await askUiConfirm('Supprimer le rappel',`Supprimer « ${title} » ?`,'Supprimer',true);
      if(!ok)return;
      const result=await runUiAction('Impossible de supprimer le rappel',()=>api(`/api/reminders/${r.id}`,{method:'DELETE'}));
      if(result.ok){shown.delete(r.id);await refresh();}
    });
    root.appendChild(row);
  });
}

function openReminderModal(reminder=null){
  const editing=!!reminder?.id;
  const raw=(reminder?.snoozed_until||reminder?.remind_at||'').slice(0,16);
  const dateValue=raw.slice(0,10)||ymd(new Date());
  const timeValue=raw.length>=16?raw.slice(11,16):'';
  const effectiveTitle=reminder?.title||reminder?.entity_title||'';
  openModal(`<h2>${editing?'Modifier le rappel':'Nouveau rappel'}</h2><form id="standaloneReminderForm" class="form-grid">
    <div class="field full"><label>Rappel</label><input name="title" required value="${esc(effectiveTitle)}" placeholder="ex. Appeler la mission locale"></div>
    <div class="field"><label>Date</label><input name="date" type="date" required value="${esc(dateValue)}"></div>
    <div class="field"><label>Heure</label><input name="time" type="time" required value="${esc(timeValue)}"></div>
    <div id="standaloneReminderError" class="form-error field full hidden"></div>
    <div class="form-actions field full"><button type="button" id="cancelStandaloneReminder">Annuler</button><button id="saveStandaloneReminder" class="primary" type="submit">${editing?'Enregistrer':'Créer le rappel'}</button></div>
  </form>`);
  const form=$('#standaloneReminderForm');
  const error=$('#standaloneReminderError');
  const submit=$('#saveStandaloneReminder');
  $('#cancelStandaloneReminder').onclick=closeModal;
  form.onsubmit=async e=>{
    e.preventDefault();
    error.classList.add('hidden'); error.textContent='';
    const fd=new FormData(form);
    const title=String(fd.get('title')||'').trim();
    const date=String(fd.get('date')||'');
    const time=String(fd.get('time')||'');
    if(!title||!date||!time){
      error.textContent='Remplis le nom, la date et l’heure.';
      error.classList.remove('hidden');
      return;
    }
    submit.disabled=true;
    submit.textContent='Enregistrement…';
    const result=await runUiAction("Impossible d’enregistrer le rappel",()=>api(editing?`/api/reminders/${reminder.id}`:'/api/reminders',{
      method:editing?'PUT':'POST',
      body:JSON.stringify({title,remind_at:`${date}T${time}`})
    }));
    if(!result.ok){
      error.textContent=result.error?.message||'Le rappel n’a pas pu être enregistré.';
      error.classList.remove('hidden');
      submit.disabled=false;
      submit.textContent=editing?'Enregistrer':'Créer le rappel';
      return;
    }
    if(reminder?.id)shown.delete(reminder.id);
    closeModal();
    await refresh();
    showView('reminders');
    setTimeout(checkDue,250);
  };
}

function openDayList(ds,items){ openModal(`<h2>${ds}</h2><div class="task-list">${items.map(e=>`<button class="event-pill ${eventClass(e.category)}" data-eid="${e.id}">${e.start_time?fmtTime(e.start_time)+' ':''}${esc(e.title)}</button>`).join('')}</div>`); $$('#modalBody [data-eid]').forEach(b=>b.addEventListener('click',()=>{const e=state.events.find(x=>x.id===Number(b.dataset.eid));openEventModal(e)})); }
function openModal(html){
  const modal=document.querySelector('.modal');
  if(modal)modal.className='modal';
  $('#modalBody').innerHTML=html;
  $('#modalBackdrop').classList.remove('hidden');
  $('#modalClose').onclick=closeModal;
}
function closeModal(){$('#modalBackdrop').classList.add('hidden');$('#modalBody').innerHTML=''}

function showUiMessage(title,message,buttonLabel='D’accord'){
  openModal(`<div class="atelier-dialog"><div class="section-kicker">L’ATELIER</div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="form-actions"><button id="atelierDialogOk" class="primary" type="button">${esc(buttonLabel)}</button></div></div>`);
  $('#atelierDialogOk').onclick=closeModal;
}

function askUiConfirm(title,message,confirmLabel='Confirmer',danger=false){
  return new Promise(resolve=>{
    openModal(`<div class="atelier-dialog"><div class="section-kicker">L’ATELIER</div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="form-actions"><button id="atelierDialogCancel" type="button">Annuler</button><button id="atelierDialogConfirm" class="${danger?'danger-button':'primary'}" type="button">${esc(confirmLabel)}</button></div></div>`);
    const finish=value=>{closeModal();resolve(value)};
    $('#atelierDialogCancel').onclick=()=>finish(false);
    $('#atelierDialogConfirm').onclick=()=>finish(true);
    $('#modalClose').onclick=()=>finish(false);
  });
}

function reminderEditor(existing=[], fallbackLabel='élément', defaultDate=''){ return `<div class="field full"><label>Rappels</label><div class="field-help">Laisse le nom vide : le rappel reprendra automatiquement le nom de ${fallbackLabel}. La date et l’heure sont séparées pour pouvoir les taper directement.</div><div id="reminderEditor" data-default-date="${esc(defaultDate)}">${existing.map(v=>reminderRow(v,defaultDate)).join('')}</div><button type="button" id="addReminder">+ Ajouter un rappel</button></div>`; }
function reminderRow(v={},defaultDate=''){ const r=typeof v==='string'?{remind_at:v,title:''}:v||{}; const raw=(r.remind_at||r.snoozed_until||'').slice(0,16); const d=raw.slice(0,10)||defaultDate||ymd(new Date()); const t=raw.length>=16?raw.slice(11,16):''; return `<div class="reminder-row-edit"><input class="reminder-name" type="text" placeholder="Nom personnalisé (facultatif)" value="${esc(r.title||'')}"><input class="reminder-date" type="date" value="${esc(d)}"><input class="reminder-time" type="time" value="${esc(t)}"><button type="button" class="remove-rem">×</button></div>`; }
function wireReminderEditor(){ const ed=$('#reminderEditor'); const defaultDate=ed?.dataset.defaultDate||''; $('#addReminder')?.addEventListener('click',()=>{ed.insertAdjacentHTML('beforeend',reminderRow({},defaultDate)); wireRemoveRem()}); wireRemoveRem(); }
function wireRemoveRem(){ $('#reminderEditor .remove-rem').forEach(b=>b.onclick=()=>b.parentElement.remove()); }
function collectReminders(){ return $('#reminderEditor .reminder-row-edit').map(row=>{const d=row.querySelector('.reminder-date').value; const t=row.querySelector('.reminder-time').value; return {title:row.querySelector('.reminder-name').value.trim(),remind_at:(d&&t)?`${d}T${t}`:''};}).filter(r=>r.remind_at); }


function foodDateLabel(s){
  if(!s) return '';
  const today=parseYMD(ymd(new Date())), d=parseYMD(s), diff=Math.round((d-today)/86400000);
  if(diff<0) return `Périmé depuis ${Math.abs(diff)} j`;
  if(diff===0) return "À consommer aujourd’hui";
  if(diff===1) return 'Expire demain';
  return `Expire dans ${diff} j · ${d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}`;
}

function foodExpiryLabel(item){
  if(item?.expiry_mode==='pending') return 'Date à renseigner';
  if(item?.expiry_mode==='none') return 'Sans date';
  return foodDateLabel(item?.expiry_date) || 'Date à renseigner';
}

function fmtMoney(v){
  if(v===null||v===undefined||v==='')return '';
  const n=Number(v); if(!Number.isFinite(n))return '';
  return n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
}

function renderKitchen(){
  const shopping=$('#shoppingList'), foods=$('#foodList'), meals=$('#mealList');
  if(!shopping||!foods||!meals) return;

  shopping.innerHTML='';
  if(!state.shopping.length) shopping.innerHTML='<div class="kitchen-empty">La liste de courses est vide.</div>';
  state.shopping.forEach(item=>{
    const count=Math.max(1,Number(item.purchase_count)||1);
    const row=document.createElement('div'); row.className='kitchen-row shopping-row'+(item.checked?' is-done':'');
    const extras=[
      item.quantity||'',
      item.price!==null&&item.price!==''?fmtMoney(item.price):'',
      item.calories!==null&&item.calories!==''?`${Number(item.calories)} kcal`:''
    ].filter(Boolean).join(' · ');
    row.innerHTML=`<input class="kitchen-check" type="checkbox" ${item.checked?'checked':''} aria-label="Pris">
      <div class="kitchen-main"><strong>${esc(item.name)}</strong><span>${esc(extras)}</span></div>
      <div class="shopping-count" aria-label="Nombre pris">
        <button class="count-minus" type="button" aria-label="Retirer un exemplaire">−</button>
        <strong>×${count}</strong>
        <button class="count-plus" type="button" aria-label="Ajouter un exemplaire">+</button>
      </div>
      <div class="kitchen-actions"><button class="edit">Modifier</button><button class="remove">×</button></div>`;
    row.querySelector('.kitchen-check').addEventListener('change',async e=>{
      await api(`/api/shopping/${item.id}`,{method:'PUT',body:JSON.stringify({checked:e.target.checked})});await refresh()
    });
    row.querySelector('.count-minus').onclick=async()=>{if(count<=1)return;await api(`/api/shopping/${item.id}`,{method:'PUT',body:JSON.stringify({purchase_count:count-1})});await refresh()};
    row.querySelector('.count-plus').onclick=async()=>{await api(`/api/shopping/${item.id}`,{method:'PUT',body:JSON.stringify({purchase_count:count+1})});await refresh()};
    row.querySelector('.edit').addEventListener('click',()=>openShoppingModal(item));
    row.querySelector('.remove').addEventListener('click',async()=>{await api(`/api/shopping/${item.id}`,{method:'PUT',body:JSON.stringify({archived:true})});await refresh()});
    shopping.appendChild(row);
  });

  foods.innerHTML='';
  if(!state.foods.length) foods.innerHTML='<div class="kitchen-empty">Aucun aliment enregistré.</div>';
  state.foods.forEach(item=>{
    const row=document.createElement('div'); row.className='kitchen-row food-row'+(item.expiry_mode==='pending'?' date-pending':'');
    const urgent=item.expiry_mode==='date' && item.expiry_date && Math.round((parseYMD(item.expiry_date)-parseYMD(ymd(new Date())))/86400000)<=3;
    const count=Math.max(1,Number(item.units_count)||1);
    const details=[
      count>1?`×${count}`:'',
      item.quantity||'',
      foodExpiryLabel(item),
      item.price!==null&&item.price!==''?fmtMoney(item.price):'',
      item.calories!==null&&item.calories!==''?`${Number(item.calories)} kcal`:''
    ].filter(Boolean).join(' · ');
    row.innerHTML=`<div class="food-dot ${urgent?'urgent':item.expiry_mode==='pending'?'pending':''}"></div>
      <div class="kitchen-main"><strong>${esc(item.name)}</strong><span>${esc(details)}</span></div>
      <div class="kitchen-actions"><button class="edit">${item.expiry_mode==='pending'?'Date':'Modifier'}</button><button class="consume">Consommé</button></div>`;
    row.querySelector('.edit').addEventListener('click',()=>openFoodModal(item));
    row.querySelector('.consume').addEventListener('click',async()=>{await api(`/api/foods/${item.id}`,{method:'PUT',body:JSON.stringify({status:'consumed'})});await refresh()});
    foods.appendChild(row);
  });

  meals.innerHTML='';
  if(!state.mealIdeas.length) meals.innerHTML='<div class="kitchen-empty">Aucune idée de repas choisie pour le moment.</div>';
  state.mealIdeas.forEach(item=>{
    const row=document.createElement('div'); row.className='kitchen-row meal-row';
    row.innerHTML=`<div class="meal-symbol">✧</div><div class="kitchen-main"><button class="meal-title-open" type="button">${esc(item.title)}</button><span>${esc(item.book_name||item.notes||'')}</span></div><div class="kitchen-actions"><button class="remove">Retirer</button></div>`;
    row.querySelector('.meal-title-open').addEventListener('click',()=>openRecipePage(item));
    row.querySelector('.remove').addEventListener('click',async()=>{
      const result=await runUiAction("Impossible de retirer l’idée",()=>api(`/api/meal-ideas/${item.idea_id}`,{method:'DELETE'}));
      if(result.ok)await refresh();
    });
    meals.appendChild(row);
  });
}


let recipeBookFilter='all';
let recipeSearchQuery='';

function normalizeRecipeSearch(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function renderCuisineLibrary(){
  const shelf=$('#recipeBookShelf'), list=$('#recipeLibraryList'), search=$('#recipeSearch');
  if(!shelf||!list||!search)return;
  search.value=recipeSearchQuery;
  search.oninput=e=>{recipeSearchQuery=e.target.value;renderCuisineLibrary()};

  shelf.innerHTML='';
  const makeBookButton=(id,label,count)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='recipe-book-button'+(String(recipeBookFilter)===String(id)?' active':'');
    b.innerHTML=`<span>${esc(label)}</span><small>${count}</small>`;
    b.onclick=()=>{recipeBookFilter=id;renderCuisineLibrary()};
    return b;
  };
  shelf.appendChild(makeBookButton('all','Toutes les recettes',state.recipes.length));
  state.recipeBooks.forEach(book=>{
    const row=document.createElement('div');
    row.className='recipe-book-row';
    row.appendChild(makeBookButton(book.id,book.name,Number(book.recipe_count)||0));
    if(String(book.name).toLowerCase()!=='à classer'){
      const actions=document.createElement('div');
      actions.className='recipe-book-actions';
      actions.innerHTML='<button class="rename" type="button" title="Renommer">✎</button><button class="delete" type="button" title="Supprimer">×</button>';
      actions.querySelector('.rename').onclick=e=>{e.stopPropagation();openRenameRecipeBookModal(book)};
      actions.querySelector('.delete').onclick=e=>{e.stopPropagation();deleteRecipeBook(book)};
      row.appendChild(actions);
    }
    shelf.appendChild(row);
  });

  const q=normalizeRecipeSearch(recipeSearchQuery);
  const rows=state.recipes.filter(item=>{
    const inBook=recipeBookFilter==='all'||Number(item.book_id)===Number(recipeBookFilter);
    const hay=normalizeRecipeSearch([item.title,item.book_name,item.notes].filter(Boolean).join(' '));
    return inBook&&(!q||hay.includes(q));
  });

  list.innerHTML='';
  if(!rows.length){
    if(!state.recipes.length){
      list.innerHTML='<div class="library-empty"><strong>Ta bibliothèque est vide.</strong><br><span>Commence une vraie recette vide, ou ajoute l’exemple Potiflette uniquement pour tester.</span><div class="library-empty-actions"><button id="createBlankRecipe" class="primary" type="button">＋ Créer ma première recette</button><button id="createTestRecipe" type="button">Ajouter l’exemple Potiflette</button></div></div>';
      $('#createBlankRecipe').onclick=()=>openRecipeModal();
      $('#createTestRecipe').onclick=createTestRecipe;
    }else{
      list.innerHTML='<div class="library-empty">Aucune recette ne correspond à cette recherche.</div>';
    }
    return;
  }
  const selectedIds=new Set(state.mealIdeas.map(x=>Number(x.id)));
  rows.forEach(item=>{
    const card=document.createElement('article');
    card.className='recipe-library-card';
    card.innerHTML=`
      <button class="recipe-library-title" type="button">${esc(item.title)}</button>
      <div class="recipe-library-meta">${esc(item.book_name||'À classer')}${item.notes?' · '+esc(item.notes):''}</div>
      <div class="recipe-library-actions">
        <button class="idea" type="button" ${selectedIds.has(Number(item.id))?'disabled':''}>${selectedIds.has(Number(item.id))?'Déjà dans les idées':'＋ Idée de repas'}</button>
        <button class="edit" type="button">Modifier</button>
        <button class="archive" type="button">Archiver</button>
      </div>`;
    card.querySelector('.recipe-library-title').onclick=()=>openRecipePage(item);
    card.querySelector('.edit').onclick=()=>openRecipeModal(item);
    card.querySelector('.archive').onclick=async()=>{
      const ok=await askUiConfirm('Archiver la recette',`Archiver « ${item.title} » ? Elle disparaîtra de la bibliothèque active, sans être supprimée définitivement.`,'Archiver',true);
      if(!ok)return;
      const result=await runUiAction("Impossible d’archiver la recette",()=>api(`/api/recipes/${item.id}`,{method:'PUT',body:JSON.stringify({archived:true})}));
      if(result.ok)await refresh();
    };
    card.querySelector('.idea').onclick=async()=>{
      if(await addRecipeToMealIdeas(item.id))renderCuisineLibrary();
    };
    list.appendChild(card);
  });
}


function openRenameRecipeBookModal(book){
  openModal(`<h2>Renommer le livre</h2><form id="renameRecipeBookForm" class="form-grid">
    <div class="field full"><label>Nouveau nom</label><input name="name" required value="${esc(book.name)}"></div>
    <div class="form-actions field full"><button type="button" id="cancelRenameBook">Annuler</button><button class="primary">Renommer</button></div>
  </form>`);
  $('#cancelRenameBook').onclick=closeModal;
  $('#renameRecipeBookForm').onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(e.currentTarget).entries());
    const result=await runUiAction("Impossible de renommer le livre",()=>api(`/api/recipe-books/${book.id}`,{method:'PUT',body:JSON.stringify(payload)}));
    if(!result.ok)return;
    closeModal();await refresh();
  };
}

async function deleteRecipeBook(book){
  const count=Number(book.recipe_count)||0;
  const message=count
    ? `Supprimer le livre « ${book.name} » ? Ses ${count} recette${count>1?'s':''} seront déplacées dans « À classer ».`
    : `Supprimer le livre « ${book.name} » ?`;
  const ok=await askUiConfirm('Supprimer le livre',message,'Supprimer',true);
  if(!ok)return;
  const result=await runUiAction("Impossible de supprimer le livre",()=>api(`/api/recipe-books/${book.id}`,{method:'DELETE'}));
  if(!result.ok)return;
  if(String(recipeBookFilter)===String(book.id))recipeBookFilter='all';
  await refresh();
}

async function createTestRecipe(){
  const sale=state.recipeBooks.find(x=>String(x.name).toLowerCase()==='salé')||state.recipeBooks.find(x=>String(x.name).toLowerCase()==='à classer')||state.recipeBooks[0];
  const payload={
    title:'Potiflette — recette de test',
    book_id:sale?.id||null,
    notes:'Recette de test : tu peux la modifier ou l’archiver après les vérifications.',
    base_servings:4,
    ingredients_json:JSON.stringify([
      {quantity:'1',unit:'',name:'potimarron'},
      {quantity:'200',unit:'g',name:'lardons'},
      {quantity:'1',unit:'',name:'reblochon'},
      {quantity:'20',unit:'cl',name:'crème fraîche'}
    ]),
    recipe:'Couper et cuire le potimarron jusqu’à ce qu’il soit tendre.\nFaire revenir les lardons.\nRéunir le tout dans un plat, ajouter la crème puis le reblochon.\nGratiner au four jusqu’à ce que le dessus soit bien doré.',
    image_data:''
  };
  const result=await runUiAction("Impossible de créer la recette de test",()=>api('/api/recipes',{method:'POST',body:JSON.stringify(payload)}));
  if(!result.ok)return;
  recipeBookFilter='all';recipeSearchQuery='';
  await refresh();
}

async function addRecipeToMealIdeas(recipeId){
  const result=await runUiAction("Impossible d’ajouter l’idée de repas",()=>api('/api/meal-ideas',{method:'POST',body:JSON.stringify({recipe_id:recipeId})}));
  if(!result.ok)return false;
  await refresh();
  return true;
}

function openMealIdeaPicker(){
  openModal(`<h2>Choisir une idée de repas</h2>
    <p class="field-help">Cette liste vient de ta bibliothèque Cuisine. Ajouter une idée ne crée pas une nouvelle recette.</p>
    <div class="field"><label>Rechercher</label><input id="mealIdeaSearch" autocomplete="off" placeholder="Potiflette, sauce, gâteau…"></div>
    <div id="mealIdeaPickerList" class="meal-idea-picker-list"></div>
    <div class="form-actions"><button type="button" id="closeMealIdeaPicker">Fermer</button></div>`);
  $('#closeMealIdeaPicker').onclick=closeModal;
  const input=$('#mealIdeaSearch'), root=$('#mealIdeaPickerList');
  const draw=()=>{
    const q=normalizeRecipeSearch(input.value);
    const selectedIds=new Set(state.mealIdeas.map(x=>Number(x.id)));
    const rows=state.recipes.filter(x=>!q||normalizeRecipeSearch([x.title,x.book_name,x.notes].filter(Boolean).join(' ')).includes(q));
    root.innerHTML='';
    if(!rows.length){root.innerHTML='<div class="library-empty">Aucune recette trouvée.</div>';return}
    rows.forEach(item=>{
      const row=document.createElement('div');
      row.className='meal-idea-picker-row';
      const selected=selectedIds.has(Number(item.id));
      row.innerHTML=`<div><strong>${esc(item.title)}</strong><span>${esc(item.book_name||'À classer')}</span></div><button type="button" ${selected?'disabled':''}>${selected?'Ajoutée':'Ajouter'}</button>`;
      row.querySelector('button').onclick=async()=>{
        if(await addRecipeToMealIdeas(item.id))draw();
      };
      root.appendChild(row);
    });
  };
  input.oninput=draw;
  draw();
  input.focus();
}

function openRecipeBookModal(){
  openModal(`<h2>Nouveau livre de recettes</h2><form id="recipeBookForm" class="form-grid">
    <div class="field full"><label>Nom du livre</label><input name="name" required placeholder="ex. Soupes, Pains, Recettes de Mamie…"></div>
    <div class="field-help full">Pour l’instant, on crée seulement le livre. Les options personnalisables du livre seront définies pendant les prochains tests.</div>
    <div class="form-actions field full"><button type="button" id="cancelRecipeBook">Annuler</button><button class="primary">Créer</button></div>
  </form>`);
  $('#cancelRecipeBook').onclick=closeModal;
  $('#recipeBookForm').onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(e.currentTarget).entries());
    const result=await runUiAction("Impossible de créer le livre",()=>api('/api/recipe-books',{method:'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;
    closeModal();await refresh();showView('cuisine');
  };
}

function fractionToAscii(s=''){
  return String(s).replaceAll('½','1/2').replaceAll('¼','1/4').replaceAll('¾','3/4').replaceAll('⅓','1/3').replaceAll('⅔','2/3').replaceAll('⅛','1/8').replaceAll('⅜','3/8').replaceAll('⅝','5/8').replaceAll('⅞','7/8');
}

function parsePastedIngredientLine(line){
  let s=fractionToAscii(String(line||'').replace(/^[•·*\-–—]+\s*/,'').trim());
  if(!s)return null;
  const m=s.match(/^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:[.,]\d+)?))\s*(.*)$/);
  let quantity='',rest=s;
  if(m){quantity=m[1].replace('.',',');rest=m[2].trim()}
  const unitRe=/^(kg|g|mg|l|dl|cl|ml|c\.?(?:\s*à\s*)?(?:soupe|café)|cuillères?\s+à\s+(?:soupe|café)|cuillères?|pincées?|sachets?|boîtes?|boites?|pots?|tranches?|gousses?|branches?|verres?)\b\s*/i;
  const u=rest.match(unitRe);
  let unit='';
  if(u){unit=u[1];rest=rest.slice(u[0].length).trim()}
  rest=rest.replace(/^d['’]\s*/i,"d’").replace(/^de\s+/i,'').trim();
  return rest?{quantity,unit,name:rest}:null;
}


function openRecipeImportModal(){
  openModal(`<div class="recipe-import">
    <div class="section-kicker">IMPORTER UNE RECETTE</div>
    <h2>Colle simplement le lien</h2>
    <form id="recipeImportForm" class="form-grid">
      <div class="field full recipe-import-mode">
        <label>Adresse de la recette</label>
        <input id="recipeImportUrl" type="url" required placeholder="https://www.marmiton.org/recettes/…" autocomplete="off">
        <div class="field-help">L’Atelier récupère automatiquement le titre, les portions, les ingrédients, les étapes et l’image quand le site les fournit.</div>
      </div>
      <div id="recipeImportError" class="form-error field full hidden"></div>
      <div class="form-actions field full"><button type="button" id="cancelRecipeImport">Annuler</button><button id="submitRecipeImport" class="primary">Importer la recette</button></div>
    </form>
  </div>`);
  const urlInput=$('#recipeImportUrl'), submit=$('#submitRecipeImport'), error=$('#recipeImportError');
  $('#cancelRecipeImport').onclick=closeModal;
  $('#recipeImportForm').onsubmit=async e=>{
    e.preventDefault();
    error.classList.add('hidden');error.textContent='';
    const raw=urlInput.value.trim();
    if(!raw){error.textContent='Colle d’abord le lien de la recette.';error.classList.remove('hidden');return}
    submit.disabled=true;submit.textContent='Import…';
    try{
      const result=await api('/api/recipe-import-url',{method:'POST',body:JSON.stringify({url:raw})});
      const ingredients=(result.ingredients||[]).map(parsePastedIngredientLine).filter(Boolean);
      const parsed={
        title:result.title||'',
        notes:result.notes||'',
        source_url:result.source_url||raw,
        base_servings:Math.max(1,Number(result.base_servings)||1),
        ingredients_json:JSON.stringify(ingredients),
        recipe:result.recipe||'',
        image_data:result.image_data||''
      };
      if(!parsed.title)throw new Error("Je n’ai pas réussi à repérer le titre.");
      openRecipeModal(null,parsed);
    }catch(err){
      error.textContent=err?.message||'Impossible d’importer cette recette.';
      error.classList.remove('hidden');
      submit.disabled=false;submit.textContent='Importer la recette';
    }
  };
  urlInput.focus();
}
async function validateShoppingPurchases(){
  const selected=state.shopping.filter(x=>x.checked);
  if(!selected.length){showUiMessage('Aucun achat sélectionné','Coche au moins un produit acheté avant de valider.');return}
  const result=await runUiAction('Impossible de valider les achats',()=>api('/api/shopping/validate',{method:'PUT',body:'{}'}));
  if(!result.ok)return;
  const res=result.value;
  await refresh();
  if(res.count) showUiMessage('Achats ajoutés',`${res.count} produit${res.count>1?'s':''} ajouté${res.count>1?'s':''} à la maison. Tu peux maintenant renseigner les dates.`);
}

function openShoppingModal(item=null){
  const editing=!!item;
  openModal(`<h2>${editing?'Modifier l’article':'Ajouter aux courses'}</h2><form id="shoppingForm" class="form-grid compact-form">
    <div class="field full"><label>Article / aliment</label><input name="name" required value="${esc(item?.name||'')}" placeholder="ex. Champignons"></div>
    <div class="field full"><label>Format / quantité</label><input name="quantity" value="${esc(item?.quantity||'')}" placeholder="ex. paquet 500 g, bouteille 1 L…"></div>
    <div class="field"><label>Prix du produit (€)</label><input name="price" inputmode="decimal" value="${esc(item?.price??'')}" placeholder="ex. 2,49"></div>
    <div class="field"><label>Calories du produit (kcal)</label><input name="calories" inputmode="decimal" value="${esc(item?.calories??'')}" placeholder="ex. 420"></div>
    <div class="form-actions field full"><button type="button" id="cancelShopping">Annuler</button><button class="primary">Enregistrer</button></div>
  </form>`);
  const f=$('#shoppingForm'); $('#cancelShopping').onclick=closeModal;
  f.onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(f).entries());
    if(!editing)payload.purchase_count=1;
    const result=await runUiAction("Impossible d’enregistrer l’article",()=>api(editing?`/api/shopping/${item.id}`:'/api/shopping',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;
    closeModal();await refresh();
  };
}

function openFoodModal(item=null,prefillName='',prefillQuantity=''){
  const editing=!!item;
  const mode=item?.expiry_mode||'pending';
  openModal(`<h2>${editing?'Modifier l’aliment':'Ajouter un aliment'}</h2><form id="foodForm" class="form-grid compact-form">
    <div class="field"><label>Aliment</label><input name="name" required value="${esc(item?.name||prefillName)}" placeholder="ex. Crème fraîche"></div>
    <div class="field"><label>Format / quantité</label><input name="quantity" value="${esc(item?.quantity||prefillQuantity)}" placeholder="ex. pot 20 cl"></div>
    <div class="field"><label>Nombre à la maison</label><div class="inline-stepper"><button id="foodCountMinus" type="button">−</button><strong id="foodCountValue">${Math.max(1,Number(item?.units_count)||1)}</strong><button id="foodCountPlus" type="button">+</button></div><input id="foodCountInput" name="units_count" type="hidden" value="${Math.max(1,Number(item?.units_count)||1)}"></div>
    <div class="field"><label>Suivi de date</label><select name="expiry_mode"><option value="pending">À renseigner</option><option value="date">Avec une date</option><option value="none">Sans date</option></select></div>
    <div id="foodExpiryDateField" class="field"><label>Date</label><input name="expiry_date" type="date" value="${esc(item?.expiry_date||'')}"></div>
    <div class="field"><label>Prix du produit (€)</label><input name="price" inputmode="decimal" value="${esc(item?.price??'')}" placeholder="ex. 2,49"></div>
    <div class="field"><label>Calories du produit (kcal)</label><input name="calories" inputmode="decimal" value="${esc(item?.calories??'')}" placeholder="ex. 420"></div>
    <div class="field full"><label>Note</label><textarea name="notes" placeholder="Facultatif">${esc(item?.notes||'')}</textarea></div>
    <div class="form-actions field full"><button type="button" id="cancelFood">Annuler</button><button class="primary">Enregistrer</button></div>
  </form>`);
  const f=$('#foodForm'), countInput=$('#foodCountInput'), countValue=$('#foodCountValue'), dateField=$('#foodExpiryDateField');
  f.expiry_mode.value=mode;
  const syncDate=()=>dateField.classList.toggle('hidden',f.expiry_mode.value!=='date');
  const setCount=n=>{n=Math.max(1,n);countInput.value=String(n);countValue.textContent=String(n)};
  $('#foodCountMinus').onclick=()=>setCount(Number(countInput.value)-1);
  $('#foodCountPlus').onclick=()=>setCount(Number(countInput.value)+1);
  f.expiry_mode.onchange=syncDate;syncDate();
  $('#cancelFood').onclick=closeModal;
  f.onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(f).entries());
    if(payload.expiry_mode!=='date')payload.expiry_date='';
    const result=await runUiAction("Impossible d’enregistrer l’aliment",()=>api(editing?`/api/foods/${item.id}`:'/api/foods',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;
    closeModal();await refresh();
  };
}

let recipeReturnView='kitchen';
let recipeCurrentId=null;
let recipeTargetServings=1;

function parseRecipeIngredients(item){
  try{
    const rows=JSON.parse(item?.ingredients_json||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(e){return []}
}

function parseScalableQuantity(raw){
  const s=String(raw||'').trim().replace(',','.');
  if(!s)return null;
  const mixed=s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if(mixed&&Number(mixed[3]))return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);
  const frac=s.match(/^(\d+)\/(\d+)$/);
  if(frac&&Number(frac[2]))return Number(frac[1])/Number(frac[2]);
  if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);
  return null;
}

function formatScaledQuantity(raw,factor){
  const n=parseScalableQuantity(raw);
  if(n===null)return raw||'';
  const rounded=Math.round(n*factor*100)/100;
  return String(rounded).replace('.',',');
}

function addIngredientEditorRow(root,row={}){
  const line=document.createElement('div');
  line.className='ingredient-edit-row';
  line.innerHTML=`<div class="ingredient-measure"><input class="ing-qty" inputmode="decimal" placeholder="1" value="${esc(row.quantity??'')}"><input class="ing-unit" placeholder="g" value="${esc(row.unit??'')}"></div><input class="ing-name" placeholder="potimarron, chocolat…" value="${esc(row.name??'')}"><button type="button" class="ing-remove" aria-label="Retirer l’ingrédient">×</button>`;
  line.querySelector('.ing-remove').onclick=()=>line.remove();
  root.appendChild(line);
}

function collectIngredientEditorRows(root){
  return [...root.querySelectorAll('.ingredient-edit-row')].map(line=>({
    quantity:line.querySelector('.ing-qty').value.trim(),
    unit:line.querySelector('.ing-unit').value.trim(),
    name:line.querySelector('.ing-name').value.trim()
  })).filter(x=>x.name);
}

function parseRecipeSteps(raw=''){
  return String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>
    x.replace(/^(?:étape\s*)?\d+\s*[.):-]?\s*/i,'').trim()
  ).filter(Boolean);
}

function renumberRecipeSteps(root){
  [...root.querySelectorAll('.recipe-step-edit-row')].forEach((row,index)=>{
    row.querySelector('.recipe-step-edit-number').textContent=`Étape ${index+1}`;
  });
}

function addRecipeStepEditorRow(root,text=''){
  const row=document.createElement('div');
  row.className='recipe-step-edit-row';
  row.innerHTML=`<div class="recipe-step-edit-number"></div><textarea class="recipe-step-edit-text" placeholder="Décris cette étape…">${esc(text)}</textarea><button class="recipe-step-remove" type="button" aria-label="Supprimer cette étape">×</button>`;
  row.querySelector('.recipe-step-remove').onclick=()=>{row.remove();renumberRecipeSteps(root)};
  root.appendChild(row);
  renumberRecipeSteps(root);
}

function collectRecipeSteps(root){
  return [...root.querySelectorAll('.recipe-step-edit-text')].map(x=>x.value.trim()).filter(Boolean).join('\n');
}

function readRecipeImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Impossible de lire l’image."));
    reader.onload=()=>resolve(String(reader.result||''));
    reader.readAsDataURL(file);
  });
}

function openRecipeModal(item=null,prefill=null){
  const editing=!!item?.id;
  const source=item||prefill||{};
  const ingredients=parseRecipeIngredients(source);
  const recipeSteps=parseRecipeSteps(source.recipe||'');
  let mealImageData=source.image_data||'';
  const fallbackBook=state.recipeBooks.find(x=>String(x.name).toLowerCase()==='à classer')?.id||state.recipeBooks[0]?.id||'';
  const selectedBook=Number(source.book_id)||Number(fallbackBook)||'';
  const bookOptions=state.recipeBooks.map(book=>`<option value="${book.id}" ${Number(book.id)===Number(selectedBook)?'selected':''}>${esc(book.name)}</option>`).join('');
  openModal(`<form id="mealForm" class="recipe-form recipe-form-04">
    <div class="recipe-edit-heading">
      <div class="section-kicker">${editing?'MODIFIER LA RECETTE':'NOUVELLE RECETTE'}</div>
      <input class="recipe-title-input" name="title" required value="${esc(source.title||'')}" placeholder="Nom de la recette">
    </div>

    <div class="recipe-edit-intro">
      <div class="recipe-avatar-field">
        <input id="mealImageInput" class="meal-image-input" type="file" accept="image/*">
        <div class="recipe-avatar-row">
          <button id="mealImagePicker" class="meal-image-picker recipe-avatar-picker ${mealImageData?'has-image':''}" type="button" aria-label="Choisir ou changer l’image de la recette">
            <img id="mealImagePreview" src="${esc(mealImageData)}" alt="${mealImageData?'Aperçu de la recette':''}" class="${mealImageData?'':'hidden'}">
            <span id="mealImagePlaceholder" class="meal-image-placeholder ${mealImageData?'hidden':''}"><strong>Photo</strong><small>Aucune image</small></span>
          </button>
          <div class="recipe-avatar-actions">
            <button id="changeMealImage" type="button">${mealImageData?'Changer':'+ Ajouter'}</button>
            <button id="removeMealImage" class="recipe-image-remove-outside ${mealImageData?'':'hidden'}" type="button">× Retirer</button>
          </div>
        </div>
      </div>

      <div class="recipe-edit-summary">
        <div class="recipe-edit-meta">
          <label class="field"><span>Livre</span><select name="book_id">${bookOptions}</select></label>
          <label class="field"><span>Recette prévue pour</span><div class="servings-input-line"><input name="base_servings" type="text" inputmode="numeric" pattern="[0-9]+" required placeholder="4" value="${source.base_servings?Math.max(1,Number(source.base_servings)||1):''}"><span>personnes</span></div></label>
        </div>
        <label class="field recipe-note-field"><span>Petite note</span><textarea name="notes" placeholder="Variante, accompagnement, conseil…">${esc(source.notes||'')}</textarea></label>
      </div>
    </div>

    <section class="recipe-edit-section ingredient-editor">
      <div class="ingredient-editor-head"><div><h3>Ingrédients</h3><small>Pour un ingrédient entier : « 1 » + « potimarron », unité vide.</small></div><button id="addIngredientRow" class="ingredient-add-btn" type="button">＋ Ajouter</button></div>
      <div class="ingredient-edit-labels"><span>Quantité + unité</span><span>Ingrédient</span><span></span></div>
      <div id="ingredientEditRows"></div>
    </section>

    <section class="recipe-edit-section recipe-steps-editor">
      <div class="recipe-steps-editor-head"><div><h3>Préparation</h3><small>Une étape par bloc : elles seront numérotées automatiquement dans le carnet.</small></div><button id="addRecipeStep" type="button">＋ Étape</button></div>
      <div id="recipeStepRows" class="recipe-step-edit-list"></div>
    </section>

    <section class="recipe-edit-section recipe-source-editor">
      <label for="recipeSourceUrl">Source <span>(facultatif)</span></label>
      <input id="recipeSourceUrl" name="source_url" type="url" value="${esc(source.source_url||'')}" placeholder="https://…">
    </section>

    <div class="form-actions recipe-form-actions"><button type="button" id="cancelMeal">Annuler</button><button class="primary">Enregistrer la recette</button></div>
  </form>`);

  document.querySelector('.modal')?.classList.add('recipe-editor-modal');

  const form=$('#mealForm'), rows=$('#ingredientEditRows'), stepRows=$('#recipeStepRows'), preview=$('#mealImagePreview'), picker=$('#mealImagePicker'), placeholder=$('#mealImagePlaceholder'), changeImage=$('#changeMealImage'), removeImage=$('#removeMealImage'), imageInput=$('#mealImageInput');
  const syncMealImagePreview=()=>{
    const has=!!mealImageData;
    preview.classList.toggle('hidden',!has);
    placeholder.classList.toggle('hidden',has);
    removeImage.classList.toggle('hidden',!has);
    picker.classList.toggle('has-image',has);
    changeImage.textContent=has?'Changer':'+ Ajouter';
    if(has){preview.src=mealImageData;preview.alt='Aperçu de la recette'}else{preview.removeAttribute('src');preview.alt=''}
  };
  (ingredients.length?ingredients:[{}]).forEach(x=>addIngredientEditorRow(rows,x));
  (recipeSteps.length?recipeSteps:['']).forEach(x=>addRecipeStepEditorRow(stepRows,x));
  $('#addIngredientRow').onclick=()=>{addIngredientEditorRow(rows,{});rows.lastElementChild?.querySelector('.ing-name')?.focus()};
  $('#addRecipeStep').onclick=()=>{addRecipeStepEditorRow(stepRows,'');stepRows.lastElementChild?.querySelector('.recipe-step-edit-text')?.focus()};
  $('#cancelMeal').onclick=closeModal;
  const applyMealImageFile=async file=>{
    if(!file)return false;
    if(!String(file.type||'').startsWith('image/')){
      showUiMessage('Fichier incompatible','Glisse une image (JPG, PNG, WEBP…).');
      return false;
    }
    if(file.size>5*1024*1024){
      showUiMessage('Image trop lourde','Choisis une image de moins de 5 Mo.');
      return false;
    }
    try{
      mealImageData=await readRecipeImage(file);
      imageInput.value='';
      syncMealImagePreview();
      return true;
    }catch(err){
      showUiMessage('Impossible d’ajouter l’image',err?.message||'Le fichier n’a pas pu être lu.');
      return false;
    }
  };
  picker.onclick=()=>imageInput.click();
  changeImage.onclick=()=>imageInput.click();
  removeImage.onclick=e=>{e.preventDefault();mealImageData='';imageInput.value='';syncMealImagePreview()};
  imageInput.onchange=async e=>{await applyMealImageFile(e.target.files?.[0])};

  const avatarDropZone=picker.closest('.recipe-avatar-row')||picker;
  const setImageDragState=active=>avatarDropZone.classList.toggle('is-image-dragover',active);
  avatarDropZone.addEventListener('dragenter',e=>{e.preventDefault();setImageDragState(true)});
  avatarDropZone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';setImageDragState(true)});
  avatarDropZone.addEventListener('dragleave',e=>{if(!avatarDropZone.contains(e.relatedTarget))setImageDragState(false)});
  avatarDropZone.addEventListener('drop',async e=>{
    e.preventDefault();
    setImageDragState(false);
    const file=[...(e.dataTransfer?.files||[])].find(f=>String(f.type||'').startsWith('image/'))||e.dataTransfer?.files?.[0];
    await applyMealImageFile(file);
  });
  syncMealImagePreview();

  form.onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(form).entries());
    payload.book_id=Number(payload.book_id)||null;
    payload.base_servings=Math.max(1,Number(payload.base_servings)||1);
    payload.ingredients_json=JSON.stringify(collectIngredientEditorRows(rows));
    payload.recipe=collectRecipeSteps(stepRows);
    payload.source_url=(payload.source_url||'').trim();
    payload.image_data=mealImageData;
    const result=await runUiAction("Impossible d’enregistrer la recette",()=>api(editing?`/api/recipes/${item.id}`:'/api/recipes',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;
    closeModal();
    await refresh();
    if(editing&&state.view==='recipe'){
      const updated=state.recipes.find(m=>m.id===item.id);
      if(updated)openRecipePage(updated);
    }
  };
}
function renderRecipePage(item){
  if(!item)return;
  const base=Math.max(1,Number(item.base_servings)||1);
  recipeTargetServings=Math.max(1,Number(recipeTargetServings)||base);
  $('#recipePageTitle').textContent=item.title||'Recette';

  const note=$('#recipePageNote');
  note.textContent=item.notes||'';
  note.classList.toggle('hidden',!item.notes);

  const img=$('#recipePageImage'), noImg=$('#recipeNoImage');
  if(item.image_data){
    img.src=item.image_data;
    img.alt=item.title||'Image de la recette';
    img.classList.remove('hidden');
    noImg.classList.add('hidden');
  }else{
    img.removeAttribute('src');
    img.classList.add('hidden');
    noImg.classList.remove('hidden');
  }

  $('#recipeServingsValue').textContent=String(recipeTargetServings);
  const list=$('#recipeIngredientsList');
  list.innerHTML='';
  const ingredients=parseRecipeIngredients(item);
  if(!ingredients.length){
    list.innerHTML='<div class="recipe-empty">Aucun ingrédient renseigné.</div>';
  }else{
    const factor=recipeTargetServings/base;
    ingredients.forEach(ing=>{
      const row=document.createElement('div');
      row.className='recipe-ingredient-row';
      const qty=formatScaledQuantity(ing.quantity,factor);
      const numericBase=parseScalableQuantity(ing.quantity);
      if(numericBase!==null&&numericBase>0){
        row.innerHTML=`<span class="recipe-ingredient-qty"><input class="recipe-ingredient-qty-input" inputmode="decimal" value="${esc(qty)}" aria-label="Quantité de ${esc(ing.name||'cet ingrédient')}"><span>${esc(ing.unit||'')}</span></span><span class="recipe-ingredient-name">${esc(ing.name||'')}</span>`;
        const input=row.querySelector('.recipe-ingredient-qty-input');
        input.addEventListener('change',()=>{
          const wanted=parseScalableQuantity(input.value);
          if(wanted===null||wanted<=0){renderRecipePage(item);return}
          const next=Math.max(1,Math.round(base*(wanted/numericBase)));
          recipeTargetServings=next;
          renderRecipePage(item);
        });
      }else{
        row.innerHTML=`<span class="recipe-ingredient-qty">${esc([qty,ing.unit].filter(Boolean).join(' '))}</span><span class="recipe-ingredient-name">${esc(ing.name||'')}</span>`;
      }
      list.appendChild(row);
    });
  }

  const instructions=$('#recipeInstructions');
  const steps=parseRecipeSteps(item.recipe||'');
  instructions.innerHTML='';
  if(!steps.length){
    instructions.innerHTML='<span class="recipe-empty">Aucune étape de préparation renseignée.</span>';
  }else{
    steps.forEach((step,index)=>{
      const block=document.createElement('div');
      block.className='recipe-step';
      block.innerHTML=`<div class="recipe-step-number">Étape ${index+1}</div><div class="recipe-step-text">${esc(step)}</div>`;
      instructions.appendChild(block);
    });
  }

  const source=$('#recipeSourceLink');
  if(item.source_url){
    source.href=item.source_url;
    source.textContent='Source : '+item.source_url;
    source.classList.remove('hidden');
  }else{
    source.removeAttribute('href');
    source.textContent='';
    source.classList.add('hidden');
  }
}
function openRecipePage(item){
  if(!item)return;
  if(state.view!=='recipe')recipeReturnView=['home','kitchen','cuisine'].includes(state.view)?state.view:'cuisine';
  recipeCurrentId=item.id;
  recipeTargetServings=Math.max(1,Number(item.base_servings)||1);
  showView('recipe');
  renderRecipePage(item);

  $('#backFromRecipe').onclick=()=>showView(recipeReturnView||'kitchen');
  $('#editRecipePage').onclick=()=>openRecipeModal(state.recipes.find(m=>m.id===recipeCurrentId)||item);
  $('#recipeServingsMinus').onclick=()=>{
    if(recipeTargetServings>1){
      recipeTargetServings--;
      renderRecipePage(state.recipes.find(m=>m.id===recipeCurrentId)||item);
    }
  };
  $('#recipeServingsPlus').onclick=()=>{
    recipeTargetServings++;
    renderRecipePage(state.recipes.find(m=>m.id===recipeCurrentId)||item);
  };
}



/* 0.9.0 — Bibliothèque : domaines ludiques, carnets, sous-objectifs et progression */
const LIBRARY_NODE_LABELS={domain:'Domaine',objective:'Objectif',milestone:'Étape',step:'Sous-étape'};
let librarySelectedDomainId=null;
let librarySelectedNotebookId=null;
let libraryNotebookState={domainId:null,sections:[],loading:false};

function objectiveNodeById(id){return state.objectiveNodes.find(x=>Number(x.id)===Number(id))||null}
function objectiveChildren(parentId){
  return state.objectiveNodes
    .filter(x=>(x.parent_id==null?null:Number(x.parent_id))===(parentId==null?null:Number(parentId)))
    .sort((a,b)=>(Number(a.order_index)||0)-(Number(b.order_index)||0)||Number(a.id)-Number(b.id));
}
function objectiveDescendantIds(id){
  const out=new Set();
  const walk=pid=>objectiveChildren(pid).forEach(ch=>{out.add(Number(ch.id));walk(ch.id)});
  walk(id);return out;
}
function objectiveSelectOptions(selectedId=null){
  const rows=['<option value="">— Aucune liaison —</option>'];
  const walk=(parentId,depth)=>{
    objectiveChildren(parentId).forEach(node=>{
      const selected=String(node.id)===String(selectedId)?' selected':'';
      const label=(LIBRARY_NODE_LABELS[node.node_type]||'Élément')+' · '+node.title;
      rows.push(`<option value="${node.id}"${selected}>${esc('— '.repeat(depth)+label)}</option>`);
      walk(node.id,depth+1);
    });
  };
  walk(null,0);
  return rows.join('');
}
function libraryRootDomains(){
  return state.objectiveNodes
    .filter(x=>x.node_type==='domain'&&x.parent_id==null)
    .sort((a,b)=>(Number(a.order_index)||0)-(Number(b.order_index)||0)||Number(a.id)-Number(b.id));
}
function libraryDomainForNode(nodeId){
  let node=objectiveNodeById(nodeId),guard=0;
  while(node?.parent_id&&guard++<50)node=objectiveNodeById(node.parent_id);
  return node?.node_type==='domain'?node:null;
}
function libraryDomainNodeIds(domainId){
  const ids=objectiveDescendantIds(domainId);ids.add(Number(domainId));return ids;
}
function libraryProgressForDomain(domain){
  const ids=objectiveDescendantIds(domain.id);
  const nodes=[...ids].map(objectiveNodeById).filter(Boolean).filter(x=>x.node_type!=='domain');
  if(!nodes.length)return Math.max(0,Math.min(100,Number(domain.progress)||0));
  const total=nodes.reduce((sum,node)=>sum+(node.status==='done'?100:Math.max(0,Math.min(100,Number(node.progress)||0))),0);
  return Math.round(total/nodes.length);
}
function safeLibraryUrl(raw){
  const value=String(raw||'').trim();
  return /^https?:\/\//i.test(value)?value:'';
}

async function loadLibraryNotebooks(domainId,preferredNotebookId=null){
  if(!domainId)return;
  libraryNotebookState={domainId:Number(domainId),sections:[],loading:true};
  renderLibraryDomain();
  try{
    const data=await api(`/api/objective-library?node_id=${encodeURIComponent(domainId)}`);
    libraryNotebookState={domainId:Number(domainId),sections:data.sections||[],loading:false};
    if(preferredNotebookId&&libraryNotebookState.sections.some(x=>Number(x.id)===Number(preferredNotebookId)))librarySelectedNotebookId=Number(preferredNotebookId);
    else if(librarySelectedNotebookId&&!libraryNotebookState.sections.some(x=>Number(x.id)===Number(librarySelectedNotebookId)))librarySelectedNotebookId=null;
  }catch(err){
    libraryNotebookState={domainId:Number(domainId),sections:[],loading:false};
    showUiError(err,'Impossible de charger les carnets');
  }
  renderLibraryDomain();
}
function openLibraryDomain(domainId){
  const domain=objectiveNodeById(domainId);
  if(!domain)return;
  librarySelectedDomainId=Number(domain.id);
  librarySelectedNotebookId=null;
  $('#libraryHubPanel')?.classList.add('hidden');
  $('#libraryDomainPanel')?.classList.remove('hidden');
  renderLibraryDomain();
  loadLibraryNotebooks(domain.id);
}
function openLibraryForNode(nodeId){
  const domain=libraryDomainForNode(nodeId);
  if(!domain)return;
  librarySelectedDomainId=Number(domain.id);
  librarySelectedNotebookId=null;
  showView('library');
  openLibraryDomain(domain.id);
}
function closeLibraryDomain(){
  librarySelectedDomainId=null;
  librarySelectedNotebookId=null;
  libraryNotebookState={domainId:null,sections:[],loading:false};
  $('#libraryDomainPanel')?.classList.add('hidden');
  $('#libraryHubPanel')?.classList.remove('hidden');
  renderLibrary();
}

function renderLibrary(){
  const shelf=$('#libraryDomainShelf');
  if(!shelf)return;
  const domains=libraryRootDomains();
  shelf.innerHTML='';
  if(!domains.length){
    shelf.innerHTML=`<div class="library-empty-state">
      <div class="library-empty-books"><i></i><i></i><i></i></div>
      <strong>Ta bibliothèque est encore vide.</strong>
      <span>Crée un premier domaine, par exemple Anglais, Art, JDR ou League of Legends.</span>
      <button id="libraryEmptyCreate" class="primary" type="button">+ Créer mon premier domaine</button>
    </div>`;
    $('#libraryEmptyCreate').onclick=()=>openLibraryDomainCreateModal();
  }else{
    domains.forEach(domain=>{
      const descendants=objectiveDescendantIds(domain.id);
      const subCount=[...descendants].map(objectiveNodeById).filter(Boolean).length;
      const ids=libraryDomainNodeIds(domain.id);
      const tasks=state.tasks.filter(t=>t.objective_node_id&&ids.has(Number(t.objective_node_id)));
      const doneTasks=tasks.filter(t=>t.completed).length;
      const progress=libraryProgressForDomain(domain);
      const card=document.createElement('article');
      card.className='library-domain-card';
      card.innerHTML=`<button class="library-domain-open" type="button">
          <span class="library-domain-card-top"><span class="library-domain-symbol">⌂</span><span class="library-domain-open-label">ouvrir →</span></span>
          <strong>${esc(domain.title)}</strong>
          <span class="library-domain-card-desc">${esc(domain.description||'Un espace à construire comme tu veux.')}</span>
          <span class="library-domain-spines" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="library-domain-card-progress"><i style="width:${progress}%"></i></span>
          <span class="library-domain-card-meta">${progress}% · ${subCount} élément${subCount>1?'s':''} · ${doneTasks}/${tasks.length} tâche${tasks.length>1?'s':''}</span>
        </button>
        <button class="library-domain-configure" type="button" title="Configurer ${esc(domain.title)}">✎</button>`;
      card.querySelector('.library-domain-open').onclick=()=>openLibraryDomain(domain.id);
      card.querySelector('.library-domain-configure').onclick=()=>openLibraryDomainConfigModal(domain);
      shelf.appendChild(card);
    });
  }
  if(librarySelectedDomainId)renderLibraryDomain();
}

function renderLibraryDomain(){
  const panel=$('#libraryDomainPanel');
  if(!panel)return;
  const domain=objectiveNodeById(librarySelectedDomainId);
  if(!domain){
    panel.classList.add('hidden');
    $('#libraryHubPanel')?.classList.remove('hidden');
    return;
  }
  $('#libraryDomainTitle').textContent=domain.title;
  $('#libraryDomainDescription').textContent=domain.description||'Cet espace est à toi : ajoute seulement ce dont tu as besoin.';
  $('#libraryDomainKicker').textContent='DOMAINE · '+String(domain.status==='done'?'TERMINÉ':domain.status==='paused'?'EN PAUSE':'ACTIF');

  renderLibraryNotebookList(domain);
  renderLibraryProgress(domain);
  renderLibraryOverview(domain);
  renderLibraryNotebookContent(domain);
}

function renderLibraryNotebookList(domain){
  const root=$('#libraryNotebookList');
  if(!root)return;
  root.innerHTML='';
  const overview=document.createElement('button');
  overview.type='button';
  overview.className='library-notebook-link library-overview-link'+(!librarySelectedNotebookId?' active':'');
  overview.innerHTML='<span class="library-notebook-icon">⌂</span><span><strong>Vue d’ensemble</strong><small>Sous-objectifs & tâches</small></span>';
  overview.onclick=()=>{librarySelectedNotebookId=null;renderLibraryDomain()};
  root.appendChild(overview);

  if(libraryNotebookState.domainId!==Number(domain.id)||libraryNotebookState.loading){
    const loading=document.createElement('div');loading.className='library-notebook-empty';loading.textContent='Chargement des carnets…';root.appendChild(loading);return;
  }
  if(!libraryNotebookState.sections.length){
    const empty=document.createElement('div');empty.className='library-notebook-empty';empty.textContent='Aucun carnet pour le moment.';root.appendChild(empty);
  }
  libraryNotebookState.sections.forEach((notebook,index)=>{
    const row=document.createElement('div');row.className='library-notebook-row';
    row.innerHTML=`<button class="library-notebook-link${Number(librarySelectedNotebookId)===Number(notebook.id)?' active':''}" type="button">
      <span class="library-notebook-spine spine-${index%4}"></span>
      <span><strong>${esc(notebook.title)}</strong><small>${(notebook.entries||[]).length} page${(notebook.entries||[]).length>1?'s':''}</small></span>
    </button><button class="library-notebook-more" type="button" title="Modifier ce carnet">⋯</button>`;
    row.querySelector('.library-notebook-link').onclick=()=>{librarySelectedNotebookId=Number(notebook.id);renderLibraryDomain()};
    row.querySelector('.library-notebook-more').onclick=()=>openLibraryNotebookModal(domain.id,notebook);
    root.appendChild(row);
  });
}

function renderLibraryProgress(domain){
  const root=$('#libraryProgressPanel');
  if(!root)return;
  const ids=libraryDomainNodeIds(domain.id);
  const descendants=[...ids].map(objectiveNodeById).filter(Boolean).filter(x=>Number(x.id)!==Number(domain.id));
  const objectives=descendants.filter(x=>x.node_type==='objective');
  const doneObjectives=objectives.filter(x=>x.status==='done').length;
  const tasks=state.tasks.filter(t=>t.objective_node_id&&ids.has(Number(t.objective_node_id)));
  const doneTasks=tasks.filter(t=>t.completed).length;
  const notebooks=libraryNotebookState.domainId===Number(domain.id)?libraryNotebookState.sections.length:0;
  const progress=libraryProgressForDomain(domain);
  root.innerHTML=`<div class="library-progress-ring" style="--library-progress:${progress}"><div><strong>${progress}%</strong><span>global</span></div></div>
    <div class="library-progress-stats">
      <div><strong>${doneObjectives}/${objectives.length}</strong><span>objectifs</span></div>
      <div><strong>${doneTasks}/${tasks.length}</strong><span>tâches</span></div>
      <div><strong>${notebooks}</strong><span>carnets</span></div>
    </div>`;
}

function renderLibraryOverview(domain){
  const overview=$('#libraryOverviewPanel'), notebookPanel=$('#libraryNotebookPanel');
  if(!overview||!notebookPanel)return;
  overview.classList.toggle('hidden',!!librarySelectedNotebookId);
  notebookPanel.classList.toggle('hidden',!librarySelectedNotebookId);
  if(librarySelectedNotebookId)return;

  const tree=$('#librarySubgoalTree');
  tree.innerHTML='';
  const children=objectiveChildren(domain.id);
  if(!children.length){
    tree.innerHTML='<div class="library-overview-empty"><strong>Aucun sous-objectif.</strong><span>Ajoute un objectif, puis des étapes et sous-étapes si tu en as besoin. Tu n’es pas obligée d’utiliser tous les niveaux.</span><button id="libraryEmptySubgoal" type="button">+ Ajouter un sous-objectif</button></div>';
    $('#libraryEmptySubgoal').onclick=()=>openLibrarySubgoalModal(domain.id);
  }else{
    children.forEach(node=>tree.appendChild(renderLibrarySubgoalBranch(node,0)));
  }

  const ids=libraryDomainNodeIds(domain.id);
  const tasks=state.tasks.filter(t=>t.objective_node_id&&ids.has(Number(t.objective_node_id))).sort((a,b)=>a.completed-b.completed||(a.due_date||'9999').localeCompare(b.due_date||'9999'));
  const taskRoot=$('#libraryDomainTasks');taskRoot.innerHTML='';
  if(!tasks.length)taskRoot.innerHTML='<div class="library-small-empty">Aucune tâche liée à ce domaine.</div>';
  tasks.slice(0,12).forEach(task=>{
    const row=document.createElement('div');row.className='library-domain-task'+(task.completed?' is-done':'');
    row.innerHTML=`<button class="library-task-toggle" type="button">${task.completed?'✓':'○'}</button><button class="library-task-open" type="button"><strong>${esc(task.title)}</strong><span>${esc(task.objective_title||domain.title)}${task.due_date?' · '+esc(task.due_date):''}</span></button>`;
    row.querySelector('.library-task-toggle').onclick=async()=>{await api(`/api/tasks/${task.id}`,{method:'PUT',body:JSON.stringify({completed:!task.completed})});await refresh()};
    row.querySelector('.library-task-open').onclick=()=>openTaskModal(task);
    taskRoot.appendChild(row);
  });
}
function renderLibrarySubgoalBranch(node,depth){
  const wrap=document.createElement('div');wrap.className='library-goal-branch';wrap.style.setProperty('--goal-depth',String(depth));
  const progress=node.status==='done'?100:Math.max(0,Math.min(100,Number(node.progress)||0));
  wrap.innerHTML=`<div class="library-goal-row">
    <button class="library-goal-main" type="button"><span class="library-goal-mark">${node.node_type==='objective'?'◎':node.node_type==='milestone'?'◇':'·'}</span><span><small>${esc(LIBRARY_NODE_LABELS[node.node_type]||'Élément')}</small><strong>${esc(node.title)}</strong></span></button>
    <div class="library-goal-progress"><i style="width:${progress}%"></i><span>${progress}%</span></div>
    <button class="library-goal-add" type="button" title="Ajouter dessous">＋</button>
    <button class="library-goal-edit" type="button" title="Modifier">✎</button>
  </div><div class="library-goal-children"></div>`;
  wrap.querySelector('.library-goal-main').onclick=()=>openLibrarySubgoalModal(librarySelectedDomainId,node.parent_id,node);
  wrap.querySelector('.library-goal-add').onclick=()=>openLibrarySubgoalModal(librarySelectedDomainId,node.id);
  wrap.querySelector('.library-goal-edit').onclick=()=>openLibrarySubgoalModal(librarySelectedDomainId,node.parent_id,node);
  const childRoot=wrap.querySelector('.library-goal-children');
  objectiveChildren(node.id).forEach(child=>childRoot.appendChild(renderLibrarySubgoalBranch(child,depth+1)));
  return wrap;
}

function renderLibraryNotebookContent(domain){
  if(!librarySelectedNotebookId)return;
  const notebook=(libraryNotebookState.sections||[]).find(x=>Number(x.id)===Number(librarySelectedNotebookId));
  if(!notebook){
    librarySelectedNotebookId=null;renderLibraryDomain();return;
  }
  $('#libraryNotebookTitle').textContent=notebook.title;
  const pages=$('#libraryNotebookPages');pages.innerHTML='';
  if(!(notebook.entries||[]).length){
    pages.innerHTML=`<div class="library-pages-empty"><div class="library-page-stack"><i></i><i></i><i></i></div><strong>Ce carnet est vide.</strong><span>Ajoute une première page : note, ressource, exercice, lien, idée…</span><button id="libraryFirstPage" class="primary" type="button">+ Première page</button></div>`;
    $('#libraryFirstPage').onclick=()=>openLibraryPageModal(notebook);
  }else{
    notebook.entries.forEach(entry=>{
      const page=document.createElement('article');page.className='library-page-card'+(entry.done?' is-done':'');
      const url=safeLibraryUrl(entry.url);
      page.innerHTML=`<div class="library-page-card-head"><button class="library-page-done" type="button" title="${entry.done?'Rouvrir':'Marquer terminé'}">${entry.done?'✓':'○'}</button><div><strong>${esc(entry.title)}</strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">ouvrir le lien ↗</a>`:''}</div><button class="library-page-edit" type="button" title="Modifier">✎</button><button class="library-page-delete" type="button" title="Supprimer">×</button></div>${entry.notes?`<div class="library-page-notes">${esc(entry.notes)}</div>`:''}`;
      page.querySelector('.library-page-done').onclick=async()=>{await api(`/api/objective-library-entries/${entry.id}`,{method:'PUT',body:JSON.stringify({done:!entry.done})});await loadLibraryNotebooks(domain.id,notebook.id)};
      page.querySelector('.library-page-edit').onclick=()=>openLibraryPageModal(notebook,entry);
      page.querySelector('.library-page-delete').onclick=()=>deleteLibraryPage(notebook,entry);
      pages.appendChild(page);
    });
  }
}

function openLibraryDomainCreateModal(){
  openModal(`<div class="library-builder"><div class="section-kicker">NOUVEAU DOMAINE</div><h2>Construire un espace</h2><p class="field-help">Tu peux préparer les carnets et les premiers sous-objectifs dès maintenant. Tout restera modifiable ensuite.</p>
    <form id="libraryDomainCreateForm" class="form-grid">
      <div class="field full"><label>Nom du domaine</label><input name="title" required placeholder="ex. Anglais, Art, JDR…"></div>
      <div class="field full"><label>À quoi sert cet espace ?</label><textarea name="description" placeholder="Une phrase pour te rappeler ce que tu veux construire ici."></textarea></div>
      <div class="field full library-builder-block"><label>Carnets de départ <span class="muted">(un par ligne, facultatif)</span></label><textarea name="notebooks" placeholder="Grammaire&#10;Vocabulaire&#10;Journal en anglais"></textarea></div>
      <div class="field full library-builder-block"><label>Premiers sous-objectifs <span class="muted">(un par ligne, facultatif)</span></label><textarea name="subgoals" placeholder="Comprendre les articles&#10;Lire un livre simple&#10;Écrire 10 minutes par jour"></textarea></div>
      <div id="libraryDomainCreateError" class="form-error field full hidden"></div>
      <div class="form-actions field full"><button id="cancelLibraryDomainCreate" type="button">Annuler</button><button class="primary" type="submit">Créer la bibliothèque</button></div>
    </form></div>`);
  $('#cancelLibraryDomainCreate').onclick=closeModal;
  $('#libraryDomainCreateForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const title=String(fd.get('title')||'').trim(),description=String(fd.get('description')||'').trim();
    const notebooks=String(fd.get('notebooks')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const subgoals=String(fd.get('subgoals')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const error=$('#libraryDomainCreateError');error.classList.add('hidden');error.textContent='';
    const result=await runUiAction('Impossible de créer le domaine',()=>api('/api/objective-nodes',{method:'POST',body:JSON.stringify({node_type:'domain',title,description,progress:0,status:'active'})}));
    if(!result.ok){error.textContent=result.error?.message||'Création impossible.';error.classList.remove('hidden');return}
    const domainId=Number(result.value.id);
    for(const notebook of notebooks){
      await runUiAction('Impossible de créer un carnet',()=>api('/api/objective-library-sections',{method:'POST',body:JSON.stringify({node_id:domainId,title:notebook,section_type:'notes'})}));
    }
    for(const subgoal of subgoals){
      await runUiAction('Impossible de créer un sous-objectif',()=>api('/api/objective-nodes',{method:'POST',body:JSON.stringify({parent_id:domainId,node_type:'objective',title:subgoal,progress:0,status:'active'})}));
    }
    closeModal();await refresh();showView('library');openLibraryDomain(domainId);
  };
}

function openLibraryDomainConfigModal(domain){
  const direct=objectiveChildren(domain.id);
  const notebookCount=libraryNotebookState.domainId===Number(domain.id)?libraryNotebookState.sections.length:0;
  openModal(`<div class="library-builder"><div class="section-kicker">CONFIGURER LE DOMAINE</div><h2>${esc(domain.title)}</h2>
    <form id="libraryDomainConfigForm" class="form-grid">
      <div class="field full"><label>Nom</label><input name="title" required value="${esc(domain.title)}"></div>
      <div class="field full"><label>Description</label><textarea name="description">${esc(domain.description||'')}</textarea></div>
      <div class="field"><label>État</label><select name="status"><option value="active" ${domain.status==='active'?'selected':''}>Actif</option><option value="paused" ${domain.status==='paused'?'selected':''}>En pause</option><option value="done" ${domain.status==='done'?'selected':''}>Terminé</option></select></div>
      <div class="field"><label>Avancée manuelle du domaine</label><input name="progress" type="number" min="0" max="100" value="${Math.max(0,Math.min(100,Number(domain.progress)||0))}"></div>
      <div class="field full library-builder-summary">
        <button id="configAddNotebook" type="button"><strong>${notebookCount}</strong><span>Carnet${notebookCount>1?'s':''}<small>+ ajouter</small></span></button>
        <button id="configAddSubgoal" type="button"><strong>${direct.length}</strong><span>Sous-objectif${direct.length>1?'s':''}<small>+ ajouter</small></span></button>
        <button id="configAddTask" type="button"><strong>${state.tasks.filter(t=>Number(t.objective_node_id)===Number(domain.id)).length}</strong><span>Tâches directes<small>+ ajouter</small></span></button>
      </div>
      <div class="form-actions field full"><button id="cancelLibraryDomainConfig" type="button">Annuler</button><button class="primary" type="submit">Enregistrer</button></div>
    </form></div>`);
  $('#cancelLibraryDomainConfig').onclick=closeModal;
  $('#configAddNotebook').onclick=()=>openLibraryNotebookModal(domain.id);
  $('#configAddSubgoal').onclick=()=>openLibrarySubgoalModal(domain.id);
  $('#configAddTask').onclick=()=>openTaskModal(null,domain.id);
  $('#libraryDomainConfigForm').onsubmit=async e=>{
    e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.progress=Number(payload.progress)||0;
    const result=await runUiAction('Impossible de modifier le domaine',()=>api(`/api/objective-nodes/${domain.id}`,{method:'PUT',body:JSON.stringify(payload)}));
    if(!result.ok)return;closeModal();await refresh();openLibraryDomain(domain.id);
  };
}

function openLibraryNotebookModal(domainId,notebook=null){
  const editing=!!notebook;
  openModal(`<h2>${editing?'Modifier le carnet':'Nouveau carnet'}</h2><form id="libraryNotebookForm" class="form-grid">
    <div class="field full"><label>Nom du carnet</label><input name="title" required value="${esc(notebook?.title||'')}" placeholder="ex. Grammaire, Vocabulaire, Inspirations…"></div>
    <div class="field-help full">Un carnet peut contenir autant de pages que tu veux : notes, liens, exercices, références ou idées.</div>
    <div class="form-actions field full"><button id="cancelLibraryNotebook" type="button">Annuler</button><button class="primary" type="submit">${editing?'Enregistrer':'Créer le carnet'}</button></div>
  </form>`);
  $('#cancelLibraryNotebook').onclick=closeModal;
  $('#libraryNotebookForm').onsubmit=async e=>{
    e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.node_id=domainId;payload.section_type='notes';
    const result=await runUiAction("Impossible d’enregistrer le carnet",()=>api(editing?`/api/objective-library-sections/${notebook.id}`:'/api/objective-library-sections',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;const preferred=editing?notebook.id:result.value?.id;closeModal();await loadLibraryNotebooks(domainId,preferred);
  };
}
async function deleteLibraryNotebook(domainId,notebook){
  const ok=await askUiConfirm('Supprimer le carnet',`Supprimer « ${notebook.title} » et toutes ses pages ?`,'Supprimer',true);
  if(!ok)return;
  const result=await runUiAction('Impossible de supprimer le carnet',()=>api(`/api/objective-library-sections/${notebook.id}`,{method:'DELETE'}));
  if(!result.ok)return;librarySelectedNotebookId=null;await loadLibraryNotebooks(domainId);
}

function openLibraryPageModal(notebook,entry=null){
  const editing=!!entry;
  openModal(`<h2>${editing?'Modifier la page':'Nouvelle page'} · ${esc(notebook.title)}</h2><form id="libraryPageForm" class="form-grid">
    <div class="field full"><label>Titre</label><input name="title" required value="${esc(entry?.title||'')}" placeholder="ex. Articles définis / indéfinis"></div>
    <div class="field full"><label>Lien <span class="muted">(facultatif)</span></label><input name="url" type="url" value="${esc(entry?.url||'')}" placeholder="https://…"></div>
    <div class="field full"><label>Contenu / notes</label><textarea name="notes" class="library-page-textarea" placeholder="Écris ce que tu veux garder dans ce carnet…">${esc(entry?.notes||'')}</textarea></div>
    <div class="field full checkline"><input id="libraryPageDone" type="checkbox" ${entry?.done?'checked':''}><label for="libraryPageDone">Page / exercice traité</label></div>
    <div class="form-actions field full"><button id="cancelLibraryPage" type="button">Annuler</button><button class="primary" type="submit">${editing?'Enregistrer':'Ajouter la page'}</button></div>
  </form>`);
  $('#cancelLibraryPage').onclick=closeModal;
  $('#libraryPageForm').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const payload=Object.fromEntries(fd.entries());payload.section_id=notebook.id;payload.done=$('#libraryPageDone').checked;
    const result=await runUiAction("Impossible d’enregistrer la page",()=>api(editing?`/api/objective-library-entries/${entry.id}`:'/api/objective-library-entries',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;closeModal();await loadLibraryNotebooks(librarySelectedDomainId,notebook.id);
  };
}
async function deleteLibraryPage(notebook,entry){
  const ok=await askUiConfirm('Supprimer la page',`Supprimer « ${entry.title} » ?`,'Supprimer',true);
  if(!ok)return;
  const result=await runUiAction('Impossible de supprimer la page',()=>api(`/api/objective-library-entries/${entry.id}`,{method:'DELETE'}));
  if(result.ok)await loadLibraryNotebooks(librarySelectedDomainId,notebook.id);
}

function openLibrarySubgoalModal(domainId,parentId=null,node=null){
  const editing=!!node;
  const actualParent=editing?node.parent_id:(parentId||domainId);
  openModal(`<h2>${editing?'Modifier':'Ajouter'} un élément de progression</h2><form id="librarySubgoalForm" class="form-grid">
    <div class="field"><label>Type</label><select name="node_type"><option value="objective" ${(node?.node_type||'objective')==='objective'?'selected':''}>Objectif</option><option value="milestone" ${node?.node_type==='milestone'?'selected':''}>Étape</option><option value="step" ${node?.node_type==='step'?'selected':''}>Sous-étape</option></select></div>
    <div class="field"><label>Dans</label><select name="parent_id">${librarySubgoalParentOptions(domainId,actualParent,node?.id)}</select></div>
    <div class="field full"><label>Nom</label><input name="title" required value="${esc(node?.title||'')}" placeholder="ex. Comprendre les articles"></div>
    <div class="field full"><label>Description</label><textarea name="description">${esc(node?.description||'')}</textarea></div>
    <div class="field"><label>État</label><select name="status"><option value="active" ${(node?.status||'active')==='active'?'selected':''}>En cours</option><option value="paused" ${node?.status==='paused'?'selected':''}>En pause</option><option value="done" ${node?.status==='done'?'selected':''}>Terminé</option></select></div>
    <div class="field"><label>Avancée (%)</label><input name="progress" type="number" min="0" max="100" value="${node?.status==='done'?100:Math.max(0,Math.min(100,Number(node?.progress)||0))}"></div>
    <div class="form-actions field full">${editing?'<button id="deleteLibrarySubgoal" class="danger-button" type="button">Supprimer</button>':''}<button id="cancelLibrarySubgoal" type="button">Annuler</button><button class="primary" type="submit">${editing?'Enregistrer':'Ajouter'}</button></div>
  </form>`);
  $('#cancelLibrarySubgoal').onclick=closeModal;
  if(editing)$('#deleteLibrarySubgoal').onclick=()=>deleteLibrarySubgoal(node);
  $('#librarySubgoalForm').onsubmit=async e=>{
    e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.parent_id=payload.parent_id||domainId;payload.progress=Number(payload.progress)||0;
    const result=await runUiAction("Impossible d’enregistrer l’élément",()=>api(editing?`/api/objective-nodes/${node.id}`:'/api/objective-nodes',{method:editing?'PUT':'POST',body:JSON.stringify(payload)}));
    if(!result.ok)return;closeModal();await refresh();openLibraryDomain(domainId);
  };
}
function librarySubgoalParentOptions(domainId,selectedParentId,excludeId=null){
  const excluded=excludeId?objectiveDescendantIds(excludeId):new Set();if(excludeId)excluded.add(Number(excludeId));
  const domain=objectiveNodeById(domainId);
  const rows=[`<option value="${domain.id}" ${String(domain.id)===String(selectedParentId)?'selected':''}>${esc(domain.title)} · racine</option>`];
  const walk=(pid,depth)=>objectiveChildren(pid).forEach(node=>{
    if(excluded.has(Number(node.id)))return;
    rows.push(`<option value="${node.id}" ${String(node.id)===String(selectedParentId)?'selected':''}>${esc('— '.repeat(depth)+(LIBRARY_NODE_LABELS[node.node_type]||'Élément')+' · '+node.title)}</option>`);
    walk(node.id,depth+1);
  });
  walk(domainId,1);return rows.join('');
}
async function deleteLibrarySubgoal(node){
  const children=objectiveDescendantIds(node.id).size;
  const ok=await askUiConfirm('Supprimer cet élément',children?`Supprimer « ${node.title} » et ses ${children} sous-élément${children>1?'s':''} ? Les tâches resteront mais seront détachées.`:`Supprimer « ${node.title} » ? Les tâches liées resteront mais seront détachées.`,'Supprimer',true);
  if(!ok)return;
  const domain=libraryDomainForNode(node.id);
  const result=await runUiAction('Impossible de supprimer cet élément',()=>api(`/api/objective-nodes/${node.id}`,{method:'DELETE'}));
  if(!result.ok)return;closeModal();await refresh();if(domain)openLibraryDomain(domain.id);
}
async function deleteLibraryDomain(domain){
  const ok=await askUiConfirm('Supprimer le domaine',`Supprimer toute la bibliothèque « ${domain.title} » : carnets, pages et sous-objectifs ? Les tâches existantes seront conservées mais détachées.`,'Supprimer',true);
  if(!ok)return;
  const result=await runUiAction('Impossible de supprimer le domaine',()=>api(`/api/objective-nodes/${domain.id}`,{method:'DELETE'}));
  if(!result.ok)return;closeLibraryDomain();await refresh();
}
