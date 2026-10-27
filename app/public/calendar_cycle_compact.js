/* ALPHA 0.18 — suivi du cycle intégré au calendrier, sans grand module.
 * Réglages par installation (localStorage), dates dans le SQLite local.
 * La fenêtre « Goblin grognon » est une convention ludique J-14, pas un diagnostic.
 */
const CYCLE_INFO_SETTING='atelierCycleShowInfo';
const CYCLE_MARKS_SETTING='atelierCycleShowMarks';
function cyclePreference(key){
  const saved=localStorage.getItem(key);
  // Préserver l'affichage pour une installation qui contient déjà un suivi.
  // Une nouvelle installation, sans dates, ne révèle aucun panneau par défaut.
  return saved===null?organisationState.periods.length>0:saved==='1';
}
function cycleShowInfoPreference(){return cyclePreference(CYCLE_INFO_SETTING)}
function cycleShowMarksPreference(){return cyclePreference(CYCLE_MARKS_SETTING)}
function renderCycleSettings(){
  const info=$('#settingsCycleShowInfo'),marks=$('#settingsCycleShowMarks');
  if(info)info.checked=cycleShowInfoPreference();
  if(marks)marks.checked=cycleShowMarksPreference();
}
function renderCycleHeader(){
  const root=$('#calendarCycleSummary');
  if(!root)return;
  root.replaceChildren();
  root.hidden=!cycleShowInfoPreference();
  if(root.hidden)return;
  const prediction=cycleEstimate();
  const label=document.createElement('span');
  label.className='calendar-cycle-chip';
  if(!prediction){
    label.textContent='Règles · estimation indisponible';
    label.title='Enregistre au moins deux débuts de règles espacés de 21 à 45 jours pour obtenir une estimation.';
    root.appendChild(label);
    return;
  }
  const days=prediction.approxDays;
  label.textContent='Règles estimées · J−'+days;
  label.title='Prochain début estimé : '+fmtFrenchDate(parseYMD(prediction.next))+
    ' · Cycle moyen observé : '+prediction.average+' jours. Estimation indicative.';
  const goblin=document.createElement('span');
  goblin.className='calendar-cycle-chip goblin-cycle-chip';
  const before=days-14;
  if(before>0){
    goblin.textContent='Mode Goblin grognon dans J−'+before;
  }else{
    goblin.textContent='Mode Goblin grognon · fenêtre estimée';
    goblin.classList.add('is-goblin-window');
  }
  goblin.title='Repère ludique fixé à 14 jours avant les prochaines règles estimées ; ne prédit pas les symptômes.';
  root.append(label,goblin);
}
function bindCalendarDateContextMenu(element,day,time=null){
  element.addEventListener('contextmenu',event=>{
    // Laisser les rendez-vous ouvrir leur propre menu.
    if(event.target.closest('.event-pill,.calendar-month-event,.week-item,.week-timed-event,.week-card-open,.day-add,.calendar-hover-actions'))return;
    event.preventDefault();event.stopPropagation();
    showAtelierContextMenu(event,[
      {label:'Nouveau rendez-vous',run:()=>openEventModal(null,day,time)},
      {label:'Règles',run:()=>openCycleQuickEditor(day,event)}
    ]);
  });
}
function openCycleQuickEditor(day,anchor){
  document.querySelector('#cycleQuickEditor')?.remove();
  const existing=organisationState.periods.find(p=>p.start_date<=day&&day<=(p.end_date||p.start_date));
  const editor=document.createElement('section');
  editor.id='cycleQuickEditor';editor.className='cycle-quick-editor';
  editor.setAttribute('role','dialog');editor.setAttribute('aria-label','Règles · édition rapide');
  editor.setAttribute('aria-modal','false');
  editor.innerHTML=`<div class="cycle-quick-heading">
    <strong>Règles</strong><button type="button" class="cycle-quick-close" aria-label="Fermer">×</button>
  </div>
  <form id="cycleQuickForm">
    <label>Début <input name="start_date" type="date" required value="${esc(existing?.start_date||day)}"></label>
    <label>Fin <span class="cycle-optional">(facultatif)</span>
      <input name="end_date" type="date" value="${esc(existing?.end_date||'')}"></label>
    <p class="cycle-quick-hint">Tu peux noter un seul jour puis ajouter la fin plus tard.</p>
    <div class="cycle-quick-actions">
      ${existing?'<button type="button" class="cycle-quick-delete">Supprimer</button>':''}
      <button type="button" class="cycle-quick-cancel">Annuler</button>
      <button type="submit" class="primary">Enregistrer</button>
    </div>
  </form>`;
  document.body.appendChild(editor);
  const width=editor.offsetWidth;
  const height=editor.offsetHeight;
  const x=Number(anchor?.clientX)>0?anchor.clientX:window.innerWidth/2;
  const y=Number(anchor?.clientY)>0?anchor.clientY:window.innerHeight/2;
  editor.style.left=Math.max(8,Math.min(x,window.innerWidth-width-8))+'px';
  editor.style.top=Math.max(8,Math.min(y,window.innerHeight-height-8))+'px';
  const form=editor.querySelector('form');
  const start=form.elements.start_date,end=form.elements.end_date;
  end.min=start.value;
  const updateMax=()=>{
    end.min=start.value;
    const limit=parseYMD(start.value);
    if(!Number.isNaN(limit.getTime())){
      limit.setDate(limit.getDate()+20);
      end.max=ymd(limit);
    }
  };
  start.addEventListener('change',updateMax);updateMax();
  let closed=false;
  const close=()=>{
    if(closed)return;
    closed=true;editor.remove();
    document.removeEventListener('keydown',escapeClose);
    document.removeEventListener('pointerdown',outsideClose,true);
  };
  const escapeClose=ev=>{if(ev.key==='Escape'){ev.preventDefault();close()}};
  const outsideClose=ev=>{if(!editor.contains(ev.target))close()};
  editor.querySelector('.cycle-quick-close').onclick=close;
  editor.querySelector('.cycle-quick-cancel').onclick=close;
  setTimeout(()=>{if(!closed)document.addEventListener('pointerdown',outsideClose,true)},0);
  document.addEventListener('keydown',escapeClose);
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(!form.reportValidity())return;
    if(end.value&&end.value<start.value){
      showUiError(new Error('La fin doit suivre le début.'),'Dates des règles');return;
    }
    const save=form.querySelector('button[type=submit]');save.disabled=true;
    const payload={start_date:start.value,end_date:end.value||null};
    const result=await runUiAction('Enregistrer les règles',()=>api(
      existing?'/api/cycle-periods/'+existing.id:'/api/cycle-periods',
      {method:existing?'PUT':'POST',body:JSON.stringify(payload)}
    ));
    if(result.ok){
      // Une première saisie active le suivi sur cette installation, pas sur celle de Nathan.
      if(localStorage.getItem(CYCLE_INFO_SETTING)===null)localStorage.setItem(CYCLE_INFO_SETTING,'1');
      if(localStorage.getItem(CYCLE_MARKS_SETTING)===null)localStorage.setItem(CYCLE_MARKS_SETTING,'1');
      close();await refreshOrganisation();
    }else save.disabled=false;
  });
  const del=editor.querySelector('.cycle-quick-delete');
  if(del)del.addEventListener('click',()=>{
    if(editor.querySelector('.cycle-quick-confirm'))return;
    const row=document.createElement('div');row.className='cycle-quick-confirm';
    row.innerHTML='<span>Supprimer cette période ?</span><button type="button" class="cycle-quick-keep">Conserver</button><button type="button" class="cycle-quick-yes">Supprimer</button>';
    row.querySelector('.cycle-quick-keep').onclick=()=>row.remove();
    row.querySelector('.cycle-quick-yes').onclick=async()=>{
      const result=await runUiAction('Supprimer les règles',()=>api('/api/cycle-periods/'+existing.id,{method:'DELETE'}));
      if(result.ok){close();await refreshOrganisation()}
    };
    form.appendChild(row);
  });
  start.focus();
}
$('#settingsCycleShowInfo')?.addEventListener('change',event=>{
  localStorage.setItem(CYCLE_INFO_SETTING,event.target.checked?'1':'0');
  renderCycleHeader();
});
$('#settingsCycleShowMarks')?.addEventListener('change',event=>{
  localStorage.setItem(CYCLE_MARKS_SETTING,event.target.checked?'1':'0');
  renderMonth();renderWeek();
});
