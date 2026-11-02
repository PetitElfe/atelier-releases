/* Préparatifs autonomes — listes libres, sans évènement artificiel.
   Les préparatifs de rendez-vous restent stockés dans event_preparations. */
let standaloneLists=[],standaloneArchives=[],standaloneArchivesOpen=false,standaloneLoadSerial=0;
const prepApi=(path,opts)=>api(path,opts);
const prepEl=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const prepButton=(label,fn,cls='')=>{const b=prepEl('button',cls,label);b.type='button';b.onclick=fn;return b};
async function loadStandalonePreparations(){
  const serial=++standaloneLoadSerial;
  const [lists,archived,upcoming]=await Promise.allSettled([
    prepApi('/api/standalone-preparations'),prepApi('/api/standalone-preparations?archived=1'),
    prepApi('/api/preparations/upcoming')
  ]);
  if(serial!==standaloneLoadSerial)return;
  if(lists.status==='fulfilled')standaloneLists=lists.value;
  if(archived.status==='fulfilled')standaloneArchives=archived.value;
  const error=[lists,archived,upcoming].find(x=>x.status==='rejected');
  if(error)showUiError(error.reason,'Chargement des préparatifs');
  renderStandalonePreparations();
  if(upcoming.status==='fulfilled')renderStandaloneAppointmentPreparations(upcoming.value);
}
async function prepAction(label,fn){
  const res=await runUiAction(label,fn);
  if(res.ok)await loadStandalonePreparations();
  return res.ok;
}
function renderStandalonePreparations(){
  const root=document.getElementById('standalonePreparationList'),
        archives=document.getElementById('standalonePreparationArchiveList'),
        toggle=document.getElementById('standalonePreparationArchiveToggle');
  if(!root)return;
  root.replaceChildren();archives.replaceChildren();
  if(!standaloneLists.length)root.append(prepEl('p','standalone-empty',
    'Aucune liste pour l’instant. Crée un préparatif pour un projet, des papiers, un voyage…'));
  for(const list of standaloneLists){
    const section=prepEl('section','standalone-preparation-card');
    const header=prepEl('div','standalone-preparation-card-head');
    const title=prepEl('h3','',list.title);
    const done=list.items.filter(x=>x.done).length;
    const count=prepEl('small','standalone-preparation-progress',
      done+' / '+list.items.length+' étapes prêtes'+(list.due_date?' · '+list.due_date.split('-').reverse().join('/'):''));
    const archive=prepButton('Archiver',async()=>{
      const ok=await askUiConfirm('Archiver « '+list.title+' »',
        'La liste et toutes ses coches seront conservées dans les archives.','Archiver');
      if(ok)await prepAction('Archiver les préparatifs',()=>
        prepApi('/api/standalone-preparations/'+list.id,
          {method:'PUT',body:JSON.stringify({archived:true})}));
    },'standalone-preparation-archive');
    const headText=prepEl('div','standalone-preparation-head-text');
    headText.append(title,count);header.append(headText,archive);section.append(header);
    const checks=prepEl('div','standalone-preparation-checks');
    for(const item of list.items){
      const line=prepEl('label','standalone-preparation-check'+(item.done?' is-done':''));
      const check=prepEl('input');check.type='checkbox';check.checked=!!item.done;
      check.setAttribute('aria-label',item.title);
      check.addEventListener('change',async()=>{
        const wanted=check.checked;check.disabled=true;
        try{
          await prepApi('/api/standalone-preparation-items/'+item.id,
            {method:'PUT',body:JSON.stringify({done:wanted})});
          item.done=wanted;
          line.classList.toggle('is-done',wanted);
          count.textContent=list.items.filter(x=>x.done).length+' / '+list.items.length+
            ' étapes prêtes'+(list.due_date?' · '+list.due_date.split('-').reverse().join('/'):'');
        }catch(err){check.checked=!wanted;showUiError(err,'Case de préparatif non enregistrée')}
        finally{check.disabled=false}
      });
      line.append(check,prepEl('span','',item.title));checks.append(line);
    }
    if(!list.items.length)checks.append(prepEl('p','muted','Ajoute ci-dessous les étapes à préparer.'));
    section.append(checks);
    const form=prepEl('form','standalone-preparation-item-form');
    const input=prepEl('input');input.type='text';input.required=true;input.maxLength=180;
    input.placeholder='Ex. : Préparer les documents, vérifier le sac…';
    input.setAttribute('aria-label','Nouvelle étape pour '+list.title);
    const submit=prepEl('button','primary','+ Ajouter');submit.type='submit';
    form.append(input,submit);
    form.onsubmit=async event=>{
      event.preventDefault();if(submit.disabled)return;
      const text=input.value.trim();if(!text)return;
      submit.disabled=true;input.disabled=true;
      try{
        const result=await runUiAction('Ajouter une étape',()=>prepApi(
          '/api/standalone-preparations/'+list.id+'/items',
          {method:'POST',body:JSON.stringify({title:text})}));
        if(result.ok){input.value='';await loadStandalonePreparations();}
      }finally{submit.disabled=false;input.disabled=false}
    };
    section.append(form);root.append(section);
  }
  archives.classList.toggle('hidden',!standaloneArchivesOpen);
  toggle.setAttribute('aria-expanded',String(standaloneArchivesOpen));
  toggle.textContent='Archives ('+standaloneArchives.length+')';
  if(standaloneArchivesOpen){
    if(!standaloneArchives.length)archives.append(prepEl('p','muted','Aucune liste archivée.'));
    for(const list of standaloneArchives){
      const row=prepEl('div','standalone-preparation-archive-row');
      row.append(prepEl('span','',list.title+' · '+list.items.length+' étapes conservées'),
        prepButton('Restaurer',()=>prepAction('Restaurer les préparatifs',()=>
          prepApi('/api/standalone-preparations/'+list.id,
            {method:'PUT',body:JSON.stringify({archived:false})}))));
      archives.append(row);
    }
  }
}
function renderStandaloneAppointmentPreparations(events){
  const root=document.getElementById('standaloneRdvUpcoming');if(!root)return;
  root.replaceChildren();
  if(!events.length){root.append(prepEl('p','muted','Aucun préparatif de rendez-vous pour aujourd’hui ou demain.'));return}
  for(const event of events){
    const group=prepEl('section','standalone-rdv-group');
    const heading=prepEl('strong','',event.title+' · '+(event.instance_date||event.event_date));
    group.append(heading);
    for(const item of event.preparations||[]){
      const row=prepEl('label','standalone-preparation-check'+(item.done?' is-done':''));
      const check=prepEl('input');check.type='checkbox';check.checked=!!item.done;
      check.addEventListener('change',async()=>{
        const wanted=check.checked;check.disabled=true;
        try{
          await prepApi('/api/events/'+event.id+'/preparations/'+item.id,{
            method:'PUT',
            body:JSON.stringify({instance_date:event.instance_date||event.event_date,done:wanted})
          });
          item.done=wanted;row.classList.toggle('is-done',wanted);
          if(typeof refresh==='function')await refresh();
        }catch(err){check.checked=!wanted;showUiError(err,'Préparatif de rendez-vous non enregistré')}
        finally{check.disabled=false}
      });
      row.append(check,prepEl('span','',item.title));group.append(row);
    }
    root.append(group);
  }
}
document.getElementById('standalonePreparationCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form).entries());
  const fields=[...form.querySelectorAll('input,button')];fields.forEach(f=>f.disabled=true);
  try{
    const result=await runUiAction('Créer une liste de préparatifs',()=>prepApi(
      '/api/standalone-preparations',{method:'POST',body:JSON.stringify(values)}));
    if(result.ok){form.reset();await loadStandalonePreparations()}
  }finally{fields.forEach(f=>f.disabled=false)}
});
document.getElementById('standalonePreparationArchiveToggle')?.addEventListener('click',()=>{
  standaloneArchivesOpen=!standaloneArchivesOpen;renderStandalonePreparations();
});
document.getElementById('standaloneOpenCalendar')?.addEventListener('click',()=>showView('calendar'));
