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
      const level=Math.max(1,Number(p.level)||1);
      const into=Math.max(0,Number(p.xp_into_level)||0);
      const total=Math.max(1,Number(p.xp_to_next_level)||100);
      const percent=Math.max(0,Math.min(100,100*into/total));
      target.replaceChildren();
      const head=document.createElement('div');head.className='top-xp-head';
      const title=document.createElement('strong');title.textContent='Niv. '+level;
      const amount=document.createElement('span');amount.textContent=into+' / '+total+' XP';
      head.append(title,amount);
      const track=document.createElement('div');track.className='top-xp-track';
      track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');
      track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuenow',String(into));
      track.setAttribute('aria-label','Expérience vers le prochain niveau');
      const fill=document.createElement('span');fill.className='top-xp-fill';
      fill.style.width=percent+'%';track.append(fill);target.append(head,track);
      target.title='Niveau '+level+' — '+p.total_xp+' XP au total, '+into+'/'+total+' vers le prochain niveau';
      target.setAttribute('aria-label',target.title);
    }catch(err){target.title='Progression momentanément indisponible'}
    finally{running=false}
  }
  readLevel();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)readLevel()});
  document.addEventListener('click',()=>{setTimeout(readLevel,750)});
})();
