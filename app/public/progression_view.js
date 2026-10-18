/* ALPHA 0.18 — lightweight global level indicator; no XP manipulation in browser. */
(function(){
  const target=document.getElementById('topXpLevel');
  if(!target)return;
  let running=false;
  async function readLevel(){
    if(running || typeof api!=='function')return;
    running=true;
    try{
      const p=await api('/api/progression');
      target.textContent='Niv. '+p.level+' · '+p.xp_into_level+'/'+p.xp_to_next_level+' XP';
      target.title='Niveau '+p.level+' — '+p.total_xp+' XP au total, '+p.xp_into_level+'/'+p.xp_to_next_level+' vers le prochain niveau';
      target.setAttribute('aria-label',target.title);
    }catch(err){target.title='Progression momentanément indisponible'}
    finally{running=false}
  }
  readLevel();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)readLevel()});
  document.addEventListener('click',()=>{setTimeout(readLevel,750)});
})();
