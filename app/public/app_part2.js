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
  if(!state.meals.length) meals.innerHTML='<div class="kitchen-empty">Aucune idée de repas pour le moment.</div>';
  state.meals.forEach(item=>{
    const row=document.createElement('div'); row.className='kitchen-row meal-row';
    row.innerHTML=`<div class="meal-symbol">✧</div><div class="kitchen-main"><strong>${esc(item.title)}</strong><span>${esc(item.notes||'')}</span></div><div class="kitchen-actions"><button class="recipe">Recette</button><button class="edit">Modifier</button><button class="remove">Retirer</button></div>`;
    row.querySelector('.recipe').addEventListener('click',()=>openMealRecipeModal(item));
    row.querySelector('.edit').addEventListener('click',()=>openMealModal(item));
    row.querySelector('.remove').addEventListener('click',async()=>{await api(`/api/meals/${item.id}`,{method:'PUT',body:JSON.stringify({archived:true})});await refresh()});
    meals.appendChild(row);
  });
}

async function validateShoppingPurchases(){
  const selected=state.shopping.filter(x=>x.checked);
  if(!selected.length){alert('Coche au moins un produit acheté.');return}
  const res=await api('/api/shopping/validate',{method:'PUT',body:'{}'});
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
    await api(editing?`/api/shopping/${item.id}`:'/api/shopping',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});
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
    await api(editing?`/api/foods/${item.id}`:'/api/foods',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});
    closeModal();await refresh();
  };
}

let recipeReturnView='kitchen';
let recipeCurrentMealId=null;
let recipeTargetServings=4;

function parseMealIngredients(item){
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

function readMealImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Impossible de lire l’image."));
    reader.onload=()=>resolve(String(reader.result||''));
    reader.readAsDataURL(file);
  });
}

function openMealModal(item=null){
  const editing=!!item;
  const ingredients=parseMealIngredients(item);
  let mealImageData=item?.image_data||'';
  openModal(`<h2>${editing?'Modifier la recette':'Nouvelle idée de repas'}</h2><form id="mealForm" class="form-grid recipe-form">
    <div class="field full"><label>Plat / idée</label><input name="title" required value="${esc(item?.title||'')}" placeholder="ex. Potiflette"></div>
    <div class="field full"><label>Petite note</label><textarea name="notes" placeholder="Variante, envie particulière, accompagnement…">${esc(item?.notes||'')}</textarea></div>
    <div class="field"><label>Recette de base pour</label><div class="servings-input-line"><input name="base_servings" type="number" min="1" max="99" value="${Math.max(1,Number(item?.base_servings)||4)}"><span>personnes</span></div></div>
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
    <div class="field full"><label>Préparation</label><textarea name="recipe" class="recipe-editor" placeholder="Écris ici les étapes de préparation…">${esc(item?.recipe||'')}</textarea></div>
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
    try{mealImageData=await readMealImage(file);syncMealImagePreview()}
    catch(err){alert(err.message||"Impossible d’ajouter cette image.")}
  };
  syncMealImagePreview();

  form.onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(form).entries());
    payload.base_servings=Math.max(1,Number(payload.base_servings)||4);
    payload.ingredients_json=JSON.stringify(collectIngredientEditorRows(rows));
    payload.image_data=mealImageData;
    await api(editing?`/api/meals/${item.id}`:'/api/meals',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});
    closeModal();
    await refresh();
    if(editing&&state.view==='recipe'){
      const updated=state.meals.find(m=>m.id===item.id);
      if(updated)openMealRecipeModal(updated);
    }
  };
}

function renderMealRecipePage(item){
  if(!item)return;
  const base=Math.max(1,Number(item.base_servings)||4);
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
  const ingredients=parseMealIngredients(item);
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

function openMealRecipeModal(item){
  if(!item)return;
  if(state.view!=='recipe')recipeReturnView=state.view==='home'?'home':'kitchen';
  recipeCurrentMealId=item.id;
  recipeTargetServings=Math.max(1,Number(item.base_servings)||4);
  showView('recipe');
  renderMealRecipePage(item);

  $('#backFromRecipe').onclick=()=>showView(recipeReturnView||'kitchen');
  $('#editRecipePage').onclick=()=>openMealModal(state.meals.find(m=>m.id===recipeCurrentMealId)||item);
  $('#recipeServingsMinus').onclick=()=>{
    if(recipeTargetServings>1){
      recipeTargetServings--;
      renderMealRecipePage(state.meals.find(m=>m.id===recipeCurrentMealId)||item);
    }
  };
  $('#recipeServingsPlus').onclick=()=>{
    recipeTargetServings++;
    renderMealRecipePage(state.meals.find(m=>m.id===recipeCurrentMealId)||item);
  };
}

