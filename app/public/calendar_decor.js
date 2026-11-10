/* Windows TEST — decoration preferences stay local to this installation. */
(function(){
  const KEY='atelier-calendar-decoration-v1';
  let prefs;try{prefs=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){prefs={}}
  if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};
  prefs.days=prefs.days||{};prefs.months=prefs.months||{};
  const baseMonth=renderMonth;
  renderMonth=function(){
    baseMonth();
    const first=monday(new Date(state.cursor.getFullYear(),state.cursor.getMonth(),1));
    document.querySelectorAll('#monthGrid .day-cell').forEach((cell,index)=>{
      const d=new Date(first);d.setDate(first.getDate()+index);const day=ymd(d),month=day.slice(0,7);
      cell.dataset.date=day;
      const individual=prefs.days[day]||{},monthly=prefs.months[month]||{};
      const image=individual.image===undefined?monthly.image:individual.image;
      const opacity=individual.opacity??monthly.opacity??35;
      if(typeof image==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(image)){
        const background=document.createElement('img');background.className='calendar-decoration';background.alt='';background.src=image;background.style.opacity=String(Math.max(0,Math.min(100,opacity))/100);cell.prepend(background);
      }
      const color=individual.color||monthly.color;
      if(/^#[0-9a-f]{6}$/i.test(color||''))cell.querySelector('.day-number').style.color=color;
      if(cell.classList.contains('cycle-recorded')||cell.classList.contains('cycle-forecast')){
        const band=document.createElement('span');band.className='calendar-cycle-band';const label=cell.classList.contains('cycle-recorded')?'Règles enregistrées':cell.dataset.cycleForecast;band.setAttribute('role','img');band.setAttribute('aria-label',label);band.title=label;cell.append(band);
      }
    });
  };
  window.openCalendarDecoration=function(day){
    document.getElementById('calendarDecorDialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='calendarDecorDialog';dialog.className='calendar-decor-dialog';
    dialog.setAttribute('aria-labelledby','calendarDecorTitle');
    dialog.innerHTML=`<form method="dialog"><h3 id="calendarDecorTitle">Décorer le calendrier</h3>
      <p>${esc(fmtFrenchDate(parseYMD(day)))}</p>
      <label>Appliquer à <select name="scope"><option value="day">Ce jour uniquement</option><option value="month">Tout ce mois</option></select></label>
      <label>Image <input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div class="calendar-decor-preview"></div>
      <label>Opacité de l’image <output name="opacityValue"></output><input name="opacity" type="range" min="0" max="100"></label>
      <label>Couleur du numéro <input name="color" type="color"></label>
      <label><input name="customColor" type="checkbox"> Personnaliser la couleur</label>
      <p class="muted">Les réglages d’un jour passent avant ceux du mois. Images et couleurs sont conservées sur cette installation.</p>
      <p class="calendar-decor-status" role="status"></p>
      <div class="calendar-decor-actions"><button type="button" data-decor="remove">Masquer l’image</button><button type="button" data-decor="inherit">Réglages par défaut</button><button value="cancel">Annuler</button><button type="button" class="primary" data-decor="save">Enregistrer</button></div>
    </form>`;
    document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());
    const form=dialog.querySelector('form'),f=form.elements,preview=dialog.querySelector('.calendar-decor-preview'),status=dialog.querySelector('[role=status]');
    let draft={},generation=0,loading=false;
    const target=()=>f.scope.value==='day'?prefs.days:prefs.months;
    const targetKey=()=>f.scope.value==='day'?day:day.slice(0,7);
    const paint=()=>{
      preview.replaceChildren();
      const image=draft.image===undefined&&f.scope.value==='day'?prefs.months[day.slice(0,7)]?.image:draft.image;
      if(image){const img=document.createElement('img');img.src=image;img.alt='Aperçu de l’image';img.style.opacity=String(Number(f.opacity.value)/100);preview.append(img)}
      f.opacityValue.value=f.opacity.value+' %';
    };
    const read=()=>{
      generation++;loading=false;draft={...(target()[targetKey()]||{})};f.image.value='';
      const fallback=f.scope.value==='day'?prefs.months[day.slice(0,7)]||{}:{};
      f.opacity.value=draft.opacity??fallback.opacity??35;f.color.value=draft.color||fallback.color||'#e8dcc4';f.customColor.checked=!!draft.color;status.textContent='';paint();
    };
    f.scope.onchange=read;
    f.opacity.oninput=()=>{draft.opacity=Number(f.opacity.value);paint()};
    f.color.oninput=()=>{f.customColor.checked=true;draft.color=f.color.value};
    f.customColor.onchange=()=>{if(f.customColor.checked)draft.color=f.color.value;else delete draft.color};
    f.image.onchange=async()=>{
      const file=f.image.files[0];if(!file)return;const version=++generation;loading=true;status.textContent='Préparation de l’image…';
      let bitmap;
      try{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Choisis une image PNG, JPEG ou WebP de moins de 15 Mo.');
        bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas'),ratio=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/webp',.8);if(version!==generation)return;
        draft.image=data;status.textContent='Image prête. Enregistre pour l’appliquer.';paint();
      }catch(err){if(version===generation)status.textContent=err.message}
      finally{bitmap?.close();if(version===generation)loading=false}
    };
    dialog.querySelector('[data-decor=remove]').onclick=()=>{generation++;loading=false;draft.image=null;f.image.value='';status.textContent='Image masquée après enregistrement.';paint()};
    dialog.querySelector('[data-decor=inherit]').onclick=()=>{generation++;loading=false;draft={};f.image.value='';f.customColor.checked=false;f.opacity.value=f.scope.value==='day'?(prefs.months[day.slice(0,7)]?.opacity??35):35;paint();status.textContent='Retour aux réglages du mois / de l’application après enregistrement.'};
    dialog.querySelector('[data-decor=save]').onclick=()=>{
      if(loading){status.textContent='Attends la préparation de l’image.';return}
      const next=JSON.parse(JSON.stringify(prefs));const collection=f.scope.value==='day'?next.days:next.months;
      if(Object.keys(draft).length)collection[targetKey()]=draft;else delete collection[targetKey()];
      try{localStorage.setItem(KEY,JSON.stringify(next));prefs=next;dialog.close();renderMonth()}
      catch(_){status.textContent='Stockage plein : les anciens réglages sont conservés. Essaie une image plus petite ou retire des images.'}
    };
    read();dialog.showModal();
  };
  // Navigation and decoration belong to the calendar's context menus.
  window.openCalendarDateJump=function(day){
    openModal('<h2>Aller à une date</h2><form id="calendarDateJumpForm" class="studio-form"><label>Date <input type="date" name="date" required></label><button type="submit">Afficher cette date</button><button type="button" id="calendarDateJumpCancel">Annuler</button></form>');
    const form=document.getElementById('calendarDateJumpForm');form.elements.date.value=day;
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;state.cursor=parseYMD(form.elements.date.value);closeModal();renderMonth();renderWeek()};
    document.getElementById('calendarDateJumpCancel').onclick=closeModal;
    form.elements.date.focus();
  };
  for(const id of ['monthTitle','weekTitle'])document.getElementById(id)?.addEventListener('contextmenu',event=>{
    event.preventDefault();showAtelierContextMenu(event,[{label:'Aller à une date…',run:()=>openCalendarDateJump(ymd(state.cursor))}]);
  });
})();
