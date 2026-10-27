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
function initDesktopPostitsControls(){
  const launch=$('#settingsOpenDesktopPostits');
  const make=$('#settingsNewDesktopPostit');
  const startup=$('#settingsDesktopPostitStartup');
  if(launch)launch.onclick=()=>startDesktopPostits(false);
  if(make)make.onclick=()=>startDesktopPostits(true);
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
