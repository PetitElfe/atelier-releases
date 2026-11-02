/* Carnet de préparation partagé : même code, SQLite différent par utilisateur. */
function eventPreparationEditor(items=[]){
  const list=Array.isArray(items)?items:[];
  const rows=list.map(p=>preparationEditorRow(p)).join('');
  return `<fieldset class="event-prep-editor field full">
    <legend>Préparer ce rendez-vous</legend>
    <p class="field-help">Documents, appels, formulaires… Ces cases se cochent séparément pour chaque date d’un rendez-vous récurrent.</p>
    <div id="eventPreparationFields">${rows}</div>
    <button id="eventAddPreparation" type="button" class="secondary">＋ Ajouter un préparatif</button>
  </fieldset>`;
}
function preparationEditorRow(item={}){
  const id=Number.isSafeInteger(Number(item.id))&&Number(item.id)>0?Number(item.id):'';
  return `<div class="event-prep-edit-row">
    <input type="text" maxlength="180" data-preparation-id="${id}" value="${esc(item.title||'')}" placeholder="Ex. Préparer les documents" aria-label="Préparatif">
    <button type="button" class="event-prep-remove" title="Retirer ce préparatif" aria-label="Retirer ce préparatif">×</button>
  </div>`;
}
function wireEventPreparationEditor(){
  const list=$('#eventPreparationFields'),add=$('#eventAddPreparation');
  if(!list||!add)return;
  list.addEventListener('click',ev=>{
    if(ev.target.closest('.event-prep-remove'))ev.target.closest('.event-prep-edit-row')?.remove();
  });
  add.onclick=()=>{
    if(list.children.length>=30){showUiError(new Error('30 préparatifs maximum.'),'Préparatifs');return}
    list.insertAdjacentHTML('beforeend',preparationEditorRow());
    list.lastElementChild.querySelector('input').focus();
  };
}
function collectEventPreparations(){
  return [...document.querySelectorAll('#eventPreparationFields input')].map(input=>({
    ...(input.dataset.preparationId?{id:Number(input.dataset.preparationId)}:{}),
    title:input.value.trim()
  })).filter(item=>item.title);
}
async function setEventPreparationDone(event,preparation,done){
  const day=event.instance_date||event.event_date;
  await api(`/api/events/${event.id}/preparations/${preparation.id}`,{
    method:'PUT',body:JSON.stringify({instance_date:day,done:!!done})
  });
  preparation.done=!!done;
  event.preparations_remaining=(event.preparations||[]).filter(p=>!p.done).length;
  state.preparationsUpcoming=await api('/api/preparations/upcoming');
  renderHome();
}
function preparationChecklistRows(event,container){
  container.innerHTML='';
  for(const item of event.preparations||[]){
    const label=document.createElement('label');label.className='event-prep-check';
    const input=document.createElement('input');input.type='checkbox';input.checked=!!item.done;
    input.disabled=eventInstanceClosed(event);
    const text=document.createElement('span');text.textContent=item.title;
    label.append(input,text);
    input.addEventListener('change',async()=>{
      input.disabled=true;
      try{
        await setEventPreparationDone(event,item,input.checked);
        input.disabled=false;
      }catch(err){
        input.checked=!input.checked;input.disabled=false;
        showUiError(err,'Impossible de cocher le préparatif');
      }
    });
    container.appendChild(label);
  }
}
function openEventPreparationDrawer(event,anchor){
  document.querySelector('.event-prep-drawer')?.remove();
  if(!event?.preparations?.length)return;
  const drawer=document.createElement('section');drawer.className='event-prep-drawer';
  drawer.setAttribute('role','dialog');drawer.setAttribute('aria-label','Préparatifs de '+event.title);
  const head=document.createElement('div');head.className='event-prep-drawer-head';
  const heading=document.createElement('strong');heading.textContent='Préparatifs · '+event.title;
  const close=document.createElement('button');close.type='button';close.textContent='×';close.title='Fermer';
  close.onclick=()=>drawer.remove();
  head.append(heading,close);
  const list=document.createElement('div');list.className='event-prep-drawer-list';
  preparationChecklistRows(event,list);
  drawer.append(head,list);document.body.appendChild(drawer);
  const rect=anchor.getBoundingClientRect();
  const width=Math.min(350,window.innerWidth-24);
  drawer.style.width=width+'px';
  drawer.style.left=Math.max(12,Math.min(rect.right+8,window.innerWidth-width-12))+'px';
  drawer.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-Math.min(300,drawer.offsetHeight)-12))+'px';
  const escapeClose=ev=>{if(ev.key==='Escape'){drawer.remove();document.removeEventListener('keydown',escapeClose)}};
  document.addEventListener('keydown',escapeClose);
  close.addEventListener('click',()=>document.removeEventListener('keydown',escapeClose));
  close.focus();
}
function renderHomePreparationBadge(){
  const header=document.querySelector('#homeUpcomingWidget .desk-note-head');
  if(!header)return;
  let badge=$('#homePreparationBadge');
  if(!badge){
    badge=document.createElement('button');badge.id='homePreparationBadge';
    badge.type='button';badge.className='home-preparation-badge';
    badge.onclick=openUpcomingPreparationsModal;
    header.insertBefore(badge,header.lastElementChild);
  }
  const items=state.preparationsUpcoming||[];
  const remaining=items.reduce((sum,e)=>sum+e.preparations_remaining,0);
  badge.hidden=remaining===0;
  badge.textContent='✎ '+remaining;
  badge.title=remaining+' préparatif(s) à faire aujourd’hui ou demain';
  badge.setAttribute('aria-label',badge.title);
}
function openUpcomingPreparationsModal(){
  const events=state.preparationsUpcoming||[];
  openModal(`<h2>Préparatifs à venir</h2><p class="muted">Aujourd’hui et demain · les rendez-vous annulés ou reportés ne sont pas comptés.</p><div id="upcomingPreparationList"></div><div class="form-actions"><button type="button" id="closeUpcomingPreparation">Fermer</button></div>`);
  $('#closeUpcomingPreparation').onclick=closeModal;
  const root=$('#upcomingPreparationList');
  for(const event of events){
    const block=document.createElement('section');block.className='upcoming-prep-group';
    const title=document.createElement('strong');title.textContent=fmtRelativeDate(event.instance_date)+' · '+event.title;
    block.appendChild(title);
    const checklist=document.createElement('div');block.appendChild(checklist);
    // La liste complète inclut aussi les éléments déjà cochés si présents.
    const local=state.events.find(e=>e.id===event.id&&e.instance_date===event.instance_date);
    const merged={...event,preparations:local?.preparations||event.preparations};
    preparationChecklistRows(merged,checklist);
    root.appendChild(block);
  }
  if(!events.length)root.textContent='Tout est prêt pour les prochains rendez-vous.';
}
