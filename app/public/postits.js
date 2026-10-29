/* L'Atelier du Goblin TEST — Windows desktop sticky notes only.
   Never display or edit a Post-it card inside the application's web UI. */
async function getDesktopPostitsStatus(){
  return await api('/api/desktop-postits/status');
}
function displayDesktopPostitsStatus(info){
  const status=$('#settingsDesktopPostitsStatus');
  const launch=$('#settingsOpenDesktopPostits');
  const make=$('#settingsNewDesktopPostit');
  const startup=$('#settingsDesktopPostitStartup');
  if(!status||!launch||!startup)return;
  const ready=!!info?.available;
  launch.disabled=!ready;
  if(make)make.disabled=!ready;
  startup.disabled=!ready;
  startup.checked=ready&&!!info.startup;
  if(!ready){
    status.textContent=info?.error||
      'Disponible seulement dans L’Atelier du Goblin TEST sous Windows.';
  }else{
    status.textContent=(info.running
      ? '✓ Les notes sont ouvertes sur le Bureau Windows.'
      : 'Les notes sont actuellement fermées.')+
      (info.startup?' Elles reviendront au démarrage de Windows.':'');
  }
}
async function refreshDesktopPostitsStatus(){
  try{displayDesktopPostitsStatus(await getDesktopPostitsStatus())}
  catch(error){
    const status=$('#settingsDesktopPostitsStatus');
    if(status)status.textContent='Compagnon Windows inaccessible.';
  }
}
async function desktopPostitsCommand(action,body={}){
  return api('/api/desktop-postits/'+action,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Atelier-Desktop':'1'},
    body:JSON.stringify(body)
  });
}
async function startDesktopPostits(create=false){
  const launch=$('#settingsOpenDesktopPostits'),make=$('#settingsNewDesktopPostit');
  if(launch)launch.disabled=true;
  if(make)make.disabled=true;
  try{
    await desktopPostitsCommand(create?'new':'start');
    const status=$('#settingsDesktopPostitsStatus');
    if(status)status.textContent=create
      ? 'Nouveau Post-it créé sur le Bureau Windows.'
      : 'Affichage des Post-it demandé sur le Bureau Windows.';
    setTimeout(refreshDesktopPostitsStatus,1700);
  }catch(error){
    showUiError(error,'Post-it Windows');
    await refreshDesktopPostitsStatus();
  }finally{
    if(launch)launch.disabled=false;
    if(make)make.disabled=false;
  }
}
/* Paramètres : seulement les titres archivés sont visibles ici, jamais les
   fenêtres ni le corps des Post-it : les notes vivent sur le Bureau Windows. */
async function refreshDesktopPostitArchives(){
  const list=$('#settingsDesktopPostitArchiveList'),counter=$('#settingsDesktopPostitArchiveCount');
  if(!list)return;
  let archived;
  try{archived=await api('/api/postits?archived=1')}
  catch(error){
    list.replaceChildren();
    const failed=document.createElement('p');
    failed.className='muted';failed.textContent='Impossible de charger les Post-it archivés.';
    list.append(failed);
    showUiError(error,'Archives des Post-it');
    return;
  }
  if(counter)counter.textContent='('+archived.length+')';
  list.replaceChildren();
  if(!archived.length){
    const empty=document.createElement('p');empty.className='muted';
    empty.textContent='Aucun Post-it archivé.';list.append(empty);return;
  }
  for(const note of archived){
    const row=document.createElement('div');row.className='postit-archive-entry';
    row.dataset.postitId=String(note.id);
    const title=document.createElement('strong');title.textContent=note.title||'Sans titre';
    const restore=document.createElement('button');restore.type='button';
    restore.textContent='Restaurer sur le Bureau';
    restore.setAttribute('aria-label','Restaurer le Post-it '+title.textContent);
    restore.addEventListener('click',async()=>{
      restore.disabled=true;
      try{
        await api('/api/postits/'+note.id,{
          method:'PUT',body:JSON.stringify({archived:false})
        });
        await refreshDesktopPostitArchives();
        let launched=false;
        try{
          const availability=await getDesktopPostitsStatus();
          if(availability.available){
            await desktopPostitsCommand('start');
            launched=true;
          }
        }catch(error){console.warn('[Atelier] Post-it restauré, compagnon non lancé',error)}
        const status=$('#settingsDesktopPostitsStatus');
        if(status)status.textContent=launched
          ? '✓ Post-it restauré ; affichage demandé sur le Bureau Windows.'
          : '✓ Post-it restauré en base locale. Ouvre le compagnon Windows pour l’afficher.';
      }catch(error){
        showUiError(error,'Restaurer le Post-it');
        restore.disabled=false;
      }
    });
    row.append(title,restore);list.append(row);
  }
}
function initDesktopPostitsControls(){
  const launch=$('#settingsOpenDesktopPostits');
  const make=$('#settingsNewDesktopPostit');
  const startup=$('#settingsDesktopPostitStartup');
  if(launch)launch.onclick=()=>startDesktopPostits(false);
  const header=$('#quickPostitsHeader');
  if(header)header.onclick=()=>startDesktopPostits(false);
  if(make)make.onclick=()=>startDesktopPostits(true);
  const archives=$('#settingsDesktopPostitArchives');
  archives?.addEventListener('toggle',()=>{
    if(archives.open)refreshDesktopPostitArchives();
  });
  if(startup)startup.onchange=async()=>{
    const enabled=startup.checked;
    startup.disabled=true;
    try{
      await desktopPostitsCommand('startup',{enabled});
      await refreshDesktopPostitsStatus();
    }catch(error){
      showUiError(error,'Démarrage Windows des Post-it');
      await refreshDesktopPostitsStatus();
    }
  };
  refreshDesktopPostitsStatus();
}
initDesktopPostitsControls();
