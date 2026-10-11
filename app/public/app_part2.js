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
      list.innerHTML='<div class="library-empty">Aucune recette pour le moment.<br><button id="createTestRecipe" class="primary library-test-recipe" type="button">Créer une recette de test</button></div>';
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
      if(!confirm(`Archiver « ${item.title} » ? La recette ne sera pas supprimée définitivement.`))return;
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
  if(!confirm(message))return;
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
      {quantity:'800',unit:'g',name:'potimarron'},
      {quantity:'200',unit:'g',name:'lardons'},
      {quantity:'200',unit:'g',name:'reblochon'},
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

function parsePastedRecipeText(raw){
  const text=String(raw||'').replace(/\u00a0/g,' ');
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const ingIndex=lines.findIndex(x=>/^ingr[ée]dients?\b/i.test(x));
  let prepIndex=lines.findIndex(x=>/^(préparation|preparation|instructions?|étapes?|etapes?)\b/i.test(x));
  if(prepIndex<0)prepIndex=lines.findIndex(x=>/^étape\s*\d+/i.test(x));

  const meta=/^(marmiton|recette|temps|préparation|preparation|cuisson|repos|difficulté|difficulte|coût|cout|bon marché|très facile|facile)\b/i;
  const titlePool=(ingIndex>0?lines.slice(0,ingIndex):lines.slice(0,Math.min(lines.length,8))).filter(x=>!meta.test(x)&&!/^\d+\s*(min|h|personnes?|portions?)\b/i.test(x));
  const title=(titlePool[0]||'').replace(/^recette\s+(de|du|des)\s+/i,'').trim();

  const servingMatch=text.match(/(?:pour\s*)?(\d+)\s*(?:personnes?|portions?)/i);
  const base_servings=servingMatch?Math.max(1,Number(servingMatch[1])||1):1;

  let ingredientLines=[];
  if(ingIndex>=0){
    const end=prepIndex>ingIndex?prepIndex:lines.length;
    ingredientLines=lines.slice(ingIndex+1,end);
  }
  ingredientLines=ingredientLines.filter(x=>!meta.test(x)&&!/^\d+\s*(min|h)\b/i.test(x));
  const ingredients=ingredientLines.map(parsePastedIngredientLine).filter(Boolean);

  let prepLines=[];
  if(prepIndex>=0)prepLines=lines.slice(prepIndex+1);
  prepLines=prepLines.filter(x=>!meta.test(x)).map(x=>x.replace(/^étape\s*\d+\s*[:.-]?\s*/i,'').trim()).filter(Boolean);

  return {
    title,
    notes:'Importée par copier-coller — vérifie les champs avant d’enregistrer.',
    base_servings,
    ingredients_json:JSON.stringify(ingredients),
    recipe:prepLines.join('\n'),
    image_data:''
  };
}

function openRecipeImportModal(){
  openModal(`<h2>Importer une recette</h2><form id="recipeImportForm" class="form-grid">
    <div class="field full"><label>URL ou texte de la recette</label><textarea id="recipePasteText" class="recipe-import-text" required placeholder="Colle l’adresse d’une recette Marmiton… ou colle directement le texte de la recette."></textarea></div>
    <div class="field-help full">Si tu colles une URL, L’Atelier essaie de lire automatiquement la recette de la page. Dans tous les cas, il ouvre ensuite l’éditeur pour que tu vérifies avant d’enregistrer.</div>
    <div class="form-actions field full"><button type="button" id="cancelRecipeImport">Annuler</button><button id="submitRecipeImport" class="primary">Analyser</button></div>
  </form>`);
  $('#cancelRecipeImport').onclick=closeModal;
  $('#recipeImportForm').onsubmit=async e=>{
    e.preventDefault();
    const raw=$('#recipePasteText').value.trim();
    const submit=$('#submitRecipeImport');
    submit.disabled=true;submit.textContent='Analyse…';
    try{
      let parsed;
      if(/^https?:\/\//i.test(raw)){
        const result=await api('/api/recipe-import-url',{method:'POST',body:JSON.stringify({url:raw})});
        const ingredients=(result.ingredients||[]).map(parsePastedIngredientLine).filter(Boolean);
        parsed={
          title:result.title||'',
          notes:[result.notes||'',result.source_url?`Source : ${result.source_url}`:''].filter(Boolean).join('\n'),
          base_servings:Math.max(1,Number(result.base_servings)||1),
          ingredients_json:JSON.stringify(ingredients),
          recipe:result.recipe||'',
          image_data:result.image_data||''
        };
      }else{
        parsed=parsePastedRecipeText(raw);
      }
      if(!parsed.title)throw new Error("Je n’ai pas réussi à repérer le titre.");
      openRecipeModal(null,parsed);
    }catch(err){
      showUiError(err,'Import de recette');
      submit.disabled=false;submit.textContent='Analyser';
    }
  };
}

async function validateShoppingPurchases(){
  const selected=state.shopping.filter(x=>x.checked);
  if(!selected.length){alert('Coche au moins un produit acheté.');return}
  const result=await runUiAction('Impossible de valider les achats',()=>api('/api/shopping/validate',{method:'PUT',body:'{}'}));
  if(!result.ok)return;
  const res=result.value;
  await refresh();
  if(res.count) alert(`${res.count} produit${res.count>1?'s':''} ajouté${res.count>1?'s':''} à la maison. Tu peux maintenant renseigner les dates.`);
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
  line.innerHTML=`<input class="ing-qty" inputmode="decimal" placeholder="Qté" value="${esc(row.quantity??'')}"><input class="ing-unit" placeholder="Unité" value="${esc(row.unit??'')}"><input class="ing-name" placeholder="Ingrédient" value="${esc(row.name??'')}"><button type="button" class="ing-remove">×</button>`;
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
  let mealImageData=source.image_data||'';
  const fallbackBook=state.recipeBooks.find(x=>String(x.name).toLowerCase()==='à classer')?.id||state.recipeBooks[0]?.id||'';
  const selectedBook=Number(source.book_id)||Number(fallbackBook)||'';
  const bookOptions=state.recipeBooks.map(book=>`<option value="${book.id}" ${Number(book.id)===Number(selectedBook)?'selected':''}>${esc(book.name)}</option>`).join('');
  openModal(`<h2>${editing?'Modifier la recette':'Nouvelle recette'}</h2><form id="mealForm" class="form-grid recipe-form">
    <div class="field full"><label>Titre de la recette</label><input name="title" required value="${esc(source.title||'')}" placeholder="ex. Potiflette"></div>
    <div class="field"><label>Livre</label><select name="book_id">${bookOptions}</select></div>
    <div class="field"><label>Cette recette est écrite pour</label><div class="servings-input-line"><input name="base_servings" type="text" inputmode="numeric" pattern="[0-9]+" required placeholder="ex. 4" value="${source.base_servings?Math.max(1,Number(source.base_servings)||1):''}"><span>personnes</span></div></div>
    <div class="field full"><label>Petite note</label><textarea name="notes" placeholder="Variante, source, accompagnement…">${esc(source.notes||'')}</textarea></div>
    <div class="field recipe-image-edit">
      <label>Image</label>
      <input id="mealImageInput" class="meal-image-input" type="file" accept="image/*">
      <button id="mealImagePicker" class="meal-image-picker ${mealImageData?'has-image':''}" type="button">
        <img id="mealImagePreview" src="${mealImageData}" alt="${mealImageData?'Aperçu de la recette':''}" class="${mealImageData?'':'hidden'}">
        <span id="mealImagePlaceholder" class="meal-image-placeholder ${mealImageData?'hidden':''}"><strong>＋ Ajouter une image</strong><small>Cliquer pour choisir une photo</small></span>
        <span id="removeMealImage" class="meal-image-remove ${mealImageData?'':'hidden'}" role="button" aria-label="Retirer l’image" title="Retirer l’image">×</span>
      </button>
    </div>
    <div class="field full ingredient-editor">
      <div class="ingredient-editor-head"><div><label>Ingrédients</label><small>Une ligne par ingrédient</small></div><button id="addIngredientRow" class="ingredient-add-btn" type="button">＋ Ajouter</button></div>
      <div class="ingredient-edit-labels"><span>Quantité</span><span>Unité</span><span>Ingrédient</span><span></span></div>
      <div id="ingredientEditRows"></div>
    </div>
    <div class="field full"><label>Préparation</label><textarea name="recipe" class="recipe-editor" placeholder="Écris ici les étapes de préparation…">${esc(source.recipe||'')}</textarea></div>
    <div class="form-actions field full"><button type="button" id="cancelMeal">Annuler</button><button class="primary">Enregistrer</button></div>
  </form>`);

  const form=$('#mealForm'), rows=$('#ingredientEditRows'), preview=$('#mealImagePreview'), picker=$('#mealImagePicker'), placeholder=$('#mealImagePlaceholder'), removeImage=$('#removeMealImage'), imageInput=$('#mealImageInput');
  const syncMealImagePreview=()=>{
    const has=!!mealImageData;
    preview.classList.toggle('hidden',!has);
    placeholder.classList.toggle('hidden',has);
    removeImage.classList.toggle('hidden',!has);
    picker.classList.toggle('has-image',has);
    if(has){preview.src=mealImageData;preview.alt='Aperçu de la recette'}else{preview.removeAttribute('src');preview.alt=''}
  };
  (ingredients.length?ingredients:[{}]).forEach(x=>addIngredientEditorRow(rows,x));
  $('#addIngredientRow').onclick=()=>{addIngredientEditorRow(rows,{});rows.lastElementChild?.querySelector('.ing-name')?.focus()};
  $('#cancelMeal').onclick=closeModal;
  picker.onclick=e=>{
    if(e.target.closest('#removeMealImage'))return;
    imageInput.click();
  };
  removeImage.onclick=e=>{e.preventDefault();e.stopPropagation();mealImageData='';imageInput.value='';syncMealImagePreview()};
  imageInput.onchange=async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    if(file.size>5*1024*1024){alert("Image trop lourde : choisis une image de moins de 5 Mo.");e.target.value='';return}
    try{mealImageData=await readRecipeImage(file);syncMealImagePreview()}
    catch(err){alert(err.message||"Impossible d’ajouter cette image.")}
  };
  syncMealImagePreview();

  form.onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(form).entries());
    payload.book_id=Number(payload.book_id)||null;
    payload.base_servings=Math.max(1,Number(payload.base_servings)||1);
    payload.ingredients_json=JSON.stringify(collectIngredientEditorRows(rows));
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
      row.innerHTML=`<span class="recipe-ingredient-qty">${esc([qty,ing.unit].filter(Boolean).join(' '))}</span><span class="recipe-ingredient-name">${esc(ing.name||'')}</span>`;
      list.appendChild(row);
    });
  }

  const instructions=$('#recipeInstructions');
  instructions.innerHTML=item.recipe?.trim()
    ? esc(item.recipe).replace(/\n/g,'<br>')
    : '<span class="recipe-empty">Aucune étape de préparation renseignée.</span>';
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

