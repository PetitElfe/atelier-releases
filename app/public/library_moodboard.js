/* Local drafts in IndexedDB + revision-checked SQLite saves. No generated images. */
(function(){
  const states=new Map(),colors=['paper','sage','lilac','sand','rose','blue'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const db=new Promise((resolve,reject)=>{const request=indexedDB.open('atelier-domain-moodboard-drafts-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  db.catch(()=>{});
  async function draftOp(id,value,remove=false){const opened=await db;return new Promise((resolve,reject)=>{const tx=opened.transaction('drafts',value===undefined&&!remove?'readonly':'readwrite'),store=tx.objectStore('drafts');const req=remove?store.delete(id):value===undefined?store.get(id):store.put(value,id);let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
  const mounted=s=>s.root?.isConnected&&s.root.dataset.domainId===String(s.id);
  function status(s){if(!mounted(s))return;const root=s.root.querySelector('[data-mood-status]');if(root)root.textContent=s.message||(s.saving?'Enregistrement…':s.dirty?'Modifications en cours…':'Enregistré');s.root.querySelector('[data-mood-undo]').disabled=!s.undo;s.root.querySelector('[data-mood-save]').disabled=s.saving||s.loading||s.conflict;for(const b of s.root.querySelectorAll('[data-mood-add]'))b.disabled=!s.ready}
  function draft(s,remove=false){const snapshot={revision:s.revision,items:clone(s.items)};s.draftQueue=(s.draftQueue||Promise.resolve()).catch(()=>{}).then(()=>draftOp(s.id,snapshot,remove)).catch(()=>{s.message='Brouillon local indisponible ; garde la fenêtre ouverte jusqu’à l’enregistrement.';status(s)});return s.draftQueue}
  function changed(s){s.version++;s.dirty=true;s.message='';status(s);clearTimeout(s.timer);if(s.gesture)return;draft(s);s.timer=setTimeout(()=>save(s),450)}
  async function save(s){
    clearTimeout(s.timer);if(s.gesture||!s.ready||s.conflict||!s.dirty)return;if(s.saving)return;
    s.saving=true;s.message='';status(s);const version=s.version,payload={domain_id:s.id,revision:s.revision,items:clone(s.items)};let success=false;
    try{const response=await api('/api/library-moodboard',{method:'PUT',body:JSON.stringify(payload)});s.revision=response.revision;success=true;
      if(version===s.version){s.dirty=false;await draft(s,true)}else await draft(s);
    }catch(error){s.conflict=error.status===409;s.message=s.conflict?'Modifié ailleurs : ton brouillon est conservé. Exporte-le avant de recharger.':'Non enregistré sur le PC — brouillon conservé ici. Réessaie.'}
    finally{s.saving=false;status(s);if(success&&s.dirty&&!s.conflict)s.timer=setTimeout(()=>save(s),0)}
  }
  function undoSnapshot(s){s.undo=clone(s.items)}
  function exportBoard(s){const blob=new Blob([JSON.stringify({format:'atelier-domain-moodboard-v1',domain_id:s.id,revision:s.revision,items:s.items},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Moodboard_domaine_'+s.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function size(s){if(!mounted(s))return;const surface=s.root.querySelector('.domain-mood-surface');surface.style.minHeight='max('+Math.max(580,...s.items.map(item=>item.y+item.h+48))+'px, calc(100vh - 245px))';const available=Math.max(180,surface.clientWidth-16);surface.querySelectorAll('[data-mood-item]').forEach(card=>{const item=s.items.find(x=>x.id===card.dataset.moodItem);const w=Math.min(item.w,available);card.style.width=w+'px';card.style.height=item.h+'px';card.style.left=Math.min(item.x,Math.max(0,available-w))+'px';card.style.top=item.y+'px'})}
  function moveOrResize(event,s,item,card,resizing){
    if(event.button!==0||s.gesture)return;event.preventDefault();const previousUndo=s.undo,geometry={x:item.x,y:item.y,w:item.w,h:item.h};undoSnapshot(s);s.gesture=true;clearTimeout(s.timer);const handle=event.currentTarget;handle.setPointerCapture(event.pointerId);
    const x=event.clientX,y=event.clientY,original={x:parseFloat(card.style.left),y:item.y,w:card.offsetWidth,h:item.h},surface=card.parentElement;
    const move=e=>{const zoom=window.AtelierDisplay?.factor||1,dx=(e.clientX-x)/zoom,dy=(e.clientY-y)/zoom;if(resizing){item.w=Math.min(1400,surface.clientWidth-original.x-12,Math.max(160,original.w+dx));item.h=Math.max(120,Math.min(1400,original.h+dy))}else{item.x=Math.max(0,Math.min(surface.clientWidth-card.offsetWidth-12,original.x+dx));item.y=Math.max(0,Math.min(20000,original.y+dy))}size(s)};
    let finished=false;
    const cleanup=()=>{finished=true;s.gesture=false;handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',cancel);handle.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',cancel);if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId)};
    const end=e=>{if(finished||e.pointerId!==event.pointerId)return;cleanup();changed(s)};
    const cancel=()=>{if(finished)return;Object.assign(item,geometry);s.undo=previousUndo;cleanup();renderItems(s);changed(s)};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);
  }
  function renderItems(s){
    if(!mounted(s))return;const surface=s.root.querySelector('.domain-mood-surface');surface.replaceChildren();
    if(!s.items.length){const empty=document.createElement('p');empty.className='domain-mood-empty';empty.textContent='Ton espace d’inspiration. Ajoute tes images, tes textes et tes liens, puis dispose-les comme tu veux.';surface.append(empty)}
    for(const item of s.items){
      const card=document.createElement('article');card.className='domain-mood-item mood-'+item.color;card.dataset.moodItem=item.id;
      const controls=document.createElement('div');controls.className='domain-mood-item-controls';
      const handle=document.createElement('button');handle.type='button';handle.className='mood-move';handle.textContent='Déplacer';handle.setAttribute('aria-label','Déplacer cet élément');handle.onpointerdown=event=>moveOrResize(event,s,item,card,false);
      handle.onkeydown=event=>{const directions={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};if(!directions[event.key])return;event.preventDefault();undoSnapshot(s);item.x=Math.max(0,Math.min(surface.clientWidth-card.offsetWidth-12,item.x+directions[event.key][0]));item.y=Math.max(0,Math.min(20000,item.y+directions[event.key][1]));size(s);changed(s)};
      const color=document.createElement('button');color.type='button';color.textContent='Couleur';color.title='Changer la couleur du papier';color.onclick=()=>{undoSnapshot(s);item.color=colors[(colors.indexOf(item.color)+1)%colors.length];card.className='domain-mood-item mood-'+item.color;changed(s)};
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Retirer cet élément');remove.onclick=()=>{undoSnapshot(s);s.items=s.items.filter(x=>x.id!==item.id);renderItems(s);changed(s)};
      controls.append(handle,color,remove);card.append(controls);
      const content=document.createElement('div');content.className='domain-mood-item-content';
      if(item.kind==='image'){const image=document.createElement('img');image.src=item.src;image.alt=item.text||'Image du moodboard';image.draggable=false;content.append(image)}
      if(item.kind==='link'){const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.url;content.append(link)}
      const text=document.createElement('textarea');text.value=item.text;text.maxLength=10000;text.placeholder=item.kind==='text'?'Écris ici…':'Légende…';text.setAttribute('aria-label',item.kind==='text'?'Texte du moodboard':'Légende de l’élément');text.oninput=()=>{item.text=text.value;changed(s)};content.append(text);card.append(content);
      const resize=document.createElement('button');resize.type='button';resize.className='mood-resize';resize.textContent='↘';resize.setAttribute('aria-label','Redimensionner cet élément');resize.onpointerdown=event=>moveOrResize(event,s,item,card,true);card.append(resize);surface.append(card);
    }
    size(s);status(s);
  }
  function add(s,kind,extra={}){if(s.items.length>=100){s.message='Le moodboard accepte au maximum 100 éléments.';status(s);return}undoSnapshot(s);const index=s.items.length,item={id:crypto.randomUUID(),kind,text:'',color:kind==='image'?'paper':'sage',x:24+(index%3)*32,y:24+(index%5)*32,w:kind==='image'?340:280,h:kind==='image'?300:220,...extra};if(JSON.stringify([...s.items,item]).length>7900000){s.message='Le moodboard est plein. Choisis une image plus petite.';status(s);return}const surface=s.root.querySelector('.domain-mood-surface'),limit=Math.max(24,surface.clientWidth-item.w-24);
    let placed=false;for(let y=24;y<20000&&!placed;y+=32){for(let x=24;x<=limit;x+=32){if(s.items.every(other=>x+item.w+12<=other.x||other.x+other.w+12<=x||y+item.h+12<=other.y||other.y+other.h+12<=y)){item.x=x;item.y=y;placed=true;break}}}
    s.items.push(item);renderItems(s);changed(s);s.root.querySelector('[data-mood-item="'+item.id+'"] textarea')?.focus()}
  async function addImage(s,file){
    let bitmap;
    try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15000000)throw Error('Choisis une image PNG, JPEG ou WebP de moins de 15 Mo.');bitmap=await createImageBitmap(file);const factor=Math.min(1,1000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const src=canvas.toDataURL('image/webp',.82);if(src.length>2000000)throw Error('Cette image reste trop volumineuse. Choisis une image plus petite.');add(s,'image',{src,text:file.name.replace(/\.[^.]+$/,'')})}
    catch(error){s.message=error.message;status(s)}finally{bitmap?.close()}
  }
  async function load(s){
    s.loading=true;status(s);let remote,local,networkError;
    try{remote=await api('/api/library-moodboard?domain_id='+s.id)}catch(error){networkError=error}
    try{local=await draftOp(s.id)}catch(_){}
    s.loading=false;
    if(remote){s.message='';s.conflict=false;s.revision=remote.revision;s.items=remote.items;s.ready=true;
      if(local&&Array.isArray(local.items)&&JSON.stringify(local.items)!==JSON.stringify(remote.items)){s.items=local.items;s.revision=local.revision;s.dirty=true;s.version++;s.conflict=local.revision!==remote.revision;s.message=s.conflict?'Modifié ailleurs : ton brouillon est conservé. Exporte-le avant de recharger.':'';if(!s.conflict)s.timer=setTimeout(()=>save(s),100)}else if(local)await draftOp(s.id,undefined,true);
    }else if(local){s.items=local.items;s.revision=local.revision;s.ready=true;s.dirty=true;s.message='Hors ligne — brouillon conservé ici. Réessaie.'}
    else{s.message='Chargement impossible. Clique sur Réessayer.';s.ready=false}
    renderItems(s);status(s);
  }
  window.libraryMoodboard={async flush(){for(const s of states.values()){if(s.gesture)throw Error('Termine le déplacement du moodboard avant de continuer.');while(s.saving)await new Promise(r=>setTimeout(r,50));if(s.dirty)await save(s);await s.draftQueue?.catch(()=>{});if(s.dirty||s.conflict)throw Error('Un moodboard reste à enregistrer. Exporte son brouillon avant une mise à jour.')}},mount(id,root){
    let s=states.get(id);if(!s){s={id,items:[],revision:0,version:0,ready:false,dirty:false,conflict:false,message:'Chargement…'};states.set(id,s)}
    if(root.dataset.domainId===String(id)){s.root=root;size(s);return}
    root.dataset.domainId=String(id);s.root=root;root.className='domain-moodboard';
    root.innerHTML='<div class="domain-mood-toolbar"><strong>Moodboard</strong><button type="button" data-mood-add="text">＋ Texte</button><button type="button" data-mood-add="image">＋ Image</button><button type="button" data-mood-add="link">＋ Lien</button><button type="button" data-mood-undo>Annuler</button><span data-mood-status role="status"></span><button type="button" data-mood-save>Enregistrer / Réessayer</button><button type="button" data-mood-export>Exporter</button><button type="button" data-mood-reload title="Recharger la version enregistrée">Recharger</button><input type="file" accept="image/png,image/jpeg,image/webp" data-mood-file hidden multiple></div><div class="domain-mood-surface" aria-label="Moodboard du domaine"></div>';
    root.querySelector('[data-mood-add=text]').onclick=()=>add(s,'text');
    const file=root.querySelector('[data-mood-file]');root.querySelector('[data-mood-add=image]').onclick=()=>file.click();file.onchange=async()=>{const files=[...file.files];file.value='';for(const image of files)await addImage(s,image)};
    root.querySelector('[data-mood-add=link]').onclick=()=>{openModal('<h2>Ajouter un lien</h2><form id="moodLinkForm"><label>Adresse Web <input name="url" type="url" required placeholder="https://…"></label><div class="form-actions"><button type="button" id="moodLinkCancel">Annuler</button><button type="submit">Ajouter</button></div></form>');$('#moodLinkCancel').onclick=closeModal;$('#moodLinkForm').onsubmit=event=>{event.preventDefault();const url=event.currentTarget.elements.url.value;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Utilise un lien http ou https sans identifiants.');add(s,'link',{url});closeModal()}catch(error){showUiError(error,'Lien du moodboard')}}};
    root.querySelector('[data-mood-undo]').onclick=()=>{if(!s.undo)return;s.items=s.undo;s.undo=null;renderItems(s);changed(s)};
    root.querySelector('[data-mood-save]').onclick=()=>s.ready?save(s):load(s);
    root.querySelector('[data-mood-export]').onclick=()=>exportBoard(s);
    root.querySelector('[data-mood-reload]').onclick=async()=>{if(s.dirty){if(!await askUiConfirm('Recharger le moodboard','Tes modifications seront exportées dans un fichier avant de recharger la version enregistrée.','Exporter et recharger'))return;exportBoard(s)}await s.draftQueue?.catch(()=>{});await draftOp(s.id,undefined,true);s.conflict=false;s.dirty=false;await load(s)};
    s.observer?.disconnect();s.observer=new ResizeObserver(()=>size(s));s.observer.observe(root.querySelector('.domain-mood-surface'));
    if(!s.ready&&!s.loading)load(s);else renderItems(s);status(s);
  }};
})();
