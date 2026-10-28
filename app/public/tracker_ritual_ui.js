/* Suivi de rituels. Les coches par étape et le compteur numérique partagent
   leur état SQLite avec les cases de Trackers et le module de l'Accueil. */
const trackerRitualDayNames=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const trackerRitualId=row=>Number(row.id||row.row_id);
const trackerMake=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const trackerRitualButton=(label,action,cls='')=>{
  const button=trackerMake('button',cls,label);button.type='button';button.onclick=action;return button;
};
function trackerOpenRitual(row,day){
  const steps=Array.isArray(row.steps)?row.steps:[];
  if(!steps.length){trackerConfigureRow(row);return}
  openModal('<h2>Mon petit rituel</h2><div id="trackerRitualModal"></div>');
  const root=document.getElementById('trackerRitualModal');
  const title=trackerMake('h3','',row.title);
  const date=trackerMake('p','muted',new Date(day+'T12:00:00').toLocaleDateString('fr-FR',
    {weekday:'long',day:'numeric',month:'long',year:'numeric'}));
  const progress=trackerMake('p','tracker-ritual-progress');
  const list=trackerMake('div','tracker-ritual-steps');
  const updateStatus=()=>{
    const checked=steps.filter(s=>s.checks?.includes(day)).length;
    progress.textContent=checked===steps.length?'✓ Validé pour aujourd’hui':
      checked+' / '+steps.length+' étapes';
    progress.classList.toggle('tracker-ritual-complete',checked===steps.length);
  };
  for(const step of steps){
    const line=trackerMake('label','tracker-ritual-step');
    const check=trackerMake('input');check.type='checkbox';
    check.checked=step.checks?.includes(day)||false;
    const text=trackerMake('span','',step.title);
    line.append(check,text);list.append(line);
    check.addEventListener('change',async()=>{
      const done=check.checked;check.disabled=true;
      try{
        const response=await api('/api/tracker-row-steps/'+step.id+'/check',{
          method:'PUT',body:JSON.stringify({day,done})
        });
        if(!step.checks)step.checks=[];
        if(done&&!step.checks.includes(day))step.checks.push(day);
        if(!done)step.checks=step.checks.filter(d=>d!==day);
        if(!row.marks)row.marks={};
        if(response.done)row.marks[day]='1';else delete row.marks[day];
        row.done=response.done;
        updateStatus();
        await loadLifeTools();
      }catch(error){
        check.checked=!done;showUiError(error,'Étape non enregistrée');
      }finally{check.disabled=false}
    });
  }
  const actions=trackerMake('div','tracker-ritual-actions');
  actions.append(trackerRitualButton('Modifier les étapes',()=>trackerConfigureRow(row)),
    trackerRitualButton('Fermer',closeModal));
  root.append(title,date,progress,list,actions);updateStatus();
}
function trackerOpenCounter(row,day){
  const goal=Number(row.target_count||0),value=Number(row.value??row.marks?.[day]??0);
  if(!goal)return;
  openModal('<h2>Mon compteur</h2><div id="trackerCounterModal"></div>');
  const root=document.getElementById('trackerCounterModal');
  root.append(trackerMake('h3','',row.title));
  const status=trackerMake('p','tracker-counter-status');
  const amount=trackerMake('strong','tracker-counter-amount');
  const render=num=>{amount.textContent=num+' / '+goal;
    status.textContent=num>=goal?'✓ Habitude validée aujourd’hui':'Chaque geste compte !';};
  render(value);
  const actions=trackerMake('div','tracker-ritual-actions');
  let current=value,busy=false;
  const change=async(next)=>{
    if(busy||next===current)return;busy=true;
    try{
      await api('/api/tracker-board-rows/'+trackerRitualId(row)+'/mark',{
        method:'PUT',body:JSON.stringify({day,value:next||null})
      });
      current=next;row.value=next;row.done=next>=goal;
      if(!row.marks)row.marks={};
      if(next)row.marks[day]=String(next);else delete row.marks[day];
      render(next);await loadLifeTools();
    }catch(error){showUiError(error,'Compteur non enregistré')}
    finally{busy=false}
  };
  actions.append(trackerRitualButton('− 1',()=>change(Math.max(0,current-1))),
    trackerRitualButton('+ 1',()=>change(Math.min(goal,current+1))),
    trackerRitualButton('Remettre à 0',()=>change(0)),
    trackerRitualButton('Fermer',closeModal));
  root.append(amount,status,actions);
}
async function trackerConfigureRow(row){
  if(row.row_id&&!row.id){
    // The Home card knows its current day but shares the same row setup.
    row={...row,id:row.row_id,marks:{}};
  }
  let options;
  try{options=await api('/api/tracker-links/options')}
  catch(error){showUiError(error,'Liens Trackers');return}
  openModal('<h2>Configurer mon suivi</h2><div id="trackerSetupModal"></div>');
  const root=document.getElementById('trackerSetupModal');
  const form=trackerMake('form','tracker-setup-form');
  const field=(label,input)=>{
    const wrap=trackerMake('label','tracker-setup-field');
    wrap.append(trackerMake('span','',label),input);return wrap;
  };
  const title=trackerMake('input');title.type='text';title.required=true;title.maxLength=100;title.value=row.title;
  form.append(field('Habitude / activité',title));
  const weekday=trackerMake('select');
  [['','Tous les jours'],...trackerRitualDayNames.map((name,i)=>[String(i),name])].forEach(([value,label])=>{
    const opt=trackerMake('option','',label);opt.value=value;weekday.append(opt);
  });
  weekday.value=row.weekday==null?'':String(row.weekday);
  form.append(field('Jour fixe (facultatif)',weekday));
  let target=null;
  if(row.mode==='number'){
    target=trackerMake('input');target.type='number';target.min=1;target.max=1000;target.required=true;
    target.value=row.target_count||'';
    form.append(field('Nombre de clics pour valider (ex. 10 verres)',target));
  }
  const group=trackerMake('div','tracker-setup-links');
  const linkType=trackerMake('select');
  [['','Aucun lien'],['task','Tâche'],['objective','Objectif'],['admin','Démarche administrative']]
    .forEach(([value,label])=>{const option=trackerMake('option','',label);
      option.value=value;linkType.append(option)});
  linkType.value=row.linked_type||'';
  const linkId=trackerMake('select');linkId.setAttribute('aria-label','Élément à relier');
  const refreshLinks=()=>{
    linkId.replaceChildren();
    const all=options[linkType.value]||[];
    for(const item of all){
      const op=trackerMake('option','',item.title);op.value=item.id;linkId.append(op);
    }
    linkId.disabled=!linkType.value||!all.length;
    if(linkType.value===row.linked_type&&row.linked_id)linkId.value=String(row.linked_id);
    if(!all.length&&linkType.value)linkId.append(trackerMake('option','','Aucun élément disponible'));
  };
  linkType.addEventListener('change',refreshLinks);refreshLinks();
  group.append(field('Relier à',linkType),field('Choisir l’élément',linkId));
  form.append(group);
  const stepSection=trackerMake('section','tracker-setup-steps');
  const stepFields=trackerMake('div','tracker-setup-step-fields');
  const stepHeading=trackerMake('h3','','Sous-étapes à cocher (facultatif)');
  const add=trackerRitualButton('＋ Ajouter une étape',()=>newStep());
  function newStep(step={}){
    if(stepFields.children.length>=30){showUiError(new Error('30 étapes maximum'),'Suivi');return}
    const wrap=trackerMake('div','tracker-setup-step-row');
    const input=trackerMake('input');input.type='text';input.required=true;input.maxLength=180;
    input.value=step.title||'';input.placeholder='Ex. Ouvrir les volets';
    if(step.id)input.dataset.stepId=step.id;
    const remove=trackerRitualButton('×',()=>wrap.remove());
    remove.setAttribute('aria-label','Retirer cette étape (historique conservé)');
    wrap.append(input,remove);stepFields.append(wrap);
  }
  if(row.mode==='check'){
    for(const step of row.steps||[])newStep(step);
    stepSection.append(stepHeading,
      trackerMake('p','muted','Quand toutes les étapes sont cochées, la case du jour est validée automatiquement.'),
      stepFields,add);form.append(stepSection);
  }
  const controls=trackerMake('div','tracker-ritual-actions');
  const save=trackerMake('button','primary','Enregistrer');save.type='submit';
  controls.append(save,trackerRitualButton('Annuler',closeModal));form.append(controls);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const steps=[...stepFields.querySelectorAll('input')].map(input=>({
      ...(input.dataset.stepId?{id:Number(input.dataset.stepId)}:{}),title:input.value.trim()
    }));
    const payload={title:title.value.trim(),weekday:weekday.value===''?null:Number(weekday.value),
      target_count:target?Number(target.value):null,
      linked_type:linkType.value,linked_id:linkType.value?Number(linkId.value):null,steps};
    save.disabled=true;
    try{
      await api('/api/tracker-board-rows/'+trackerRitualId(row)+'/setup',{
        method:'PUT',body:JSON.stringify(payload)
      });
      closeModal();await loadLifeTools();
    }catch(error){showUiError(error,'Configuration non enregistrée')}
    finally{save.disabled=false}
  });
  root.append(form);
}
let trackerHistorySerial=0;
async function loadTrackerArchiveHistory(){
  const serial=++trackerHistorySerial;
  const history=document.getElementById('settingsTrackerHistory');
  if(!history)return;
  history.textContent='Chargement de l’historique…';
  try{
    const [months,current,oldLists,oldArchived]=await Promise.all([
      api('/api/tracker-boards/history'),
      api('/api/tracker-boards?archived=1'),
      api('/api/standalone-preparations'),
      api('/api/standalone-preparations?archived=1')
    ]);
    if(serial!==trackerHistorySerial)return;
    lifeArchivedBoards=current;
    history.replaceChildren();
    if(!months.length)history.append(trackerMake('p','muted',
      'Le premier résumé apparaîtra ici quand un mois de suivi sera terminé.'));
    let shown=0;
    for(const month of months){
      if(shown++>=240)break;
      const box=trackerMake('details','tracker-month-archive');
      const label=new Date(month.month+'-01T12:00:00').toLocaleDateString('fr-FR',
        {month:'long',year:'numeric'});
      const summary=trackerMake('summary','',month.board_title+' · '+label+' · '+
        month.completed+'/'+month.total);box.append(summary);
      for(const line of month.rows){
        box.append(trackerMake('p','tracker-archive-line',
          line.title+' : '+line.completed+'/'+line.total));
      }
      history.append(box);
    }
    const toggle=document.getElementById('trackerBoardArchivesToggle');
    if(toggle){
      toggle.textContent='Tableaux archivés ('+lifeArchivedBoards.length+')';
      toggle.setAttribute('aria-expanded',String(lifeBoardArchivesVisible));
    }
    if(typeof renderTrackerBoards==='function')renderTrackerBoards();
    const legacy=document.getElementById('settingsLegacyPreparations');
    if(legacy){
      legacy.replaceChildren();
      for(const old of [...oldLists,...oldArchived]){
        const details=trackerMake('details','tracker-month-archive');
        details.append(trackerMake('summary','',old.title+(old.archived?' (archivée)':'')));
        for(const step of old.items||[]){
          details.append(trackerMake('p','tracker-archive-line',(step.done?'✓ ':'○ ')+step.title));
        }
        legacy.append(details);
      }
      if(!oldLists.length&&!oldArchived.length)legacy.append(trackerMake('p','muted','Aucune ancienne liste.'));
    }
  }catch(error){history.textContent='Impossible de charger les archives.';
    showUiError(error,'Archives des Trackers')}
}
document.getElementById('settingsRefreshTrackerArchives')?.addEventListener('click',loadTrackerArchiveHistory);
