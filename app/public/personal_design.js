/* Own-art skins: stable targets, preview first, explicit save, no content changes. */
(()=>{'use strict';
 const card=document.querySelector('#settingsPersonalDesignCard'),start=document.querySelector('#personalDesignStart');
 if(!card||!start)return;
 let theme={},saved={},revision=0,active=false,picking=false,selected='app',busy=false,history=[],targets=new Map(),dirty=false,pendingImage=0;
 const style=document.createElement('style');style.id='personalDesignRules';document.head.append(style);
 const dock=document.createElement('aside');dock.id='personalDesignDock';dock.hidden=true;dock.setAttribute('aria-label','Mode création personnel');
 dock.innerHTML=`<div class="design-heading"><strong>Mes dessins · aperçu</strong><button type="button" data-design="exit" aria-label="Fermer le mode création">Fermer</button></div>
 <p class="design-help">Choisis une zone ou active « Viser », puis dépose une image dessus. Échap quitte la sélection.</p>
 <div class="design-line"><select data-design="target" aria-label="Zone à habiller"></select><button type="button" data-design="pick" aria-pressed="false">Viser</button></div>
 <p data-design="guide"></p><p data-design="asset"></p>
 <div class="design-line"><button type="button" data-design="file">Choisir une image</button><button type="button" data-design="template">Gabarit PNG</button></div>
 <input hidden type="file" accept="image/png,image/jpeg,image/webp" data-design="image">
 <label>Affichage <select data-design="fit"><option value="contain">Entier, sans couper</option><option value="cover">Remplir, avec recadrage</option><option value="repeat">Motif répété</option></select></label>
 <label>Échelle <input type="range" min="10" max="200" value="100" data-design="size"></label>
 <label>Position horizontale <input type="range" min="0" max="100" value="50" data-design="x"></label>
 <label>Position verticale <input type="range" min="0" max="100" value="50" data-design="y"></label>
 <label><input type="checkbox" data-design="hideLabel"> Mon dessin contient déjà le texte du bouton</label>
 <div class="design-line"><button type="button" data-design="remove">Retirer ce dessin</button><button type="button" data-design="undo">Annuler</button></div>
 <div class="design-line"><button type="button" data-design="save">Enregistrer le thème</button><button type="button" data-design="revert">Revenir au thème enregistré</button></div>
 <div class="design-line"><button type="button" data-design="export">Exporter</button><button type="button" data-design="import">Importer un thème</button></div>
 <input hidden type="file" accept="application/json,.json" data-design="json">
 <p data-design="status" role="status" aria-live="polite"></p>`;
 document.body.append(dock);
 const $=name=>dock.querySelector('[data-design="'+name+'"]');
 const marker=document.createElement('div');marker.id='personalDesignMarker';marker.hidden=true;document.body.append(marker);
 const copy=t=>JSON.parse(JSON.stringify(t));
 const status=s=>{$('status').textContent=s};
 const label=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||el.querySelector('h1,h2,h3')?.textContent||el.textContent||el.id).trim().replace(/\s+/g,' ').slice(0,65);
 function register(){
   const next=new Map([['app',{el:document.body,name:'Fond général',kind:'fond'}]]);
   const head=document.querySelector('header.topbar');if(head)next.set('header',{el:head,name:'Bandeau du haut',kind:'fond'});
   for(const el of document.querySelectorAll('main .view[id],main section[id],main article[id],main div[id],button[id],button[data-notebook-id]')){
     if(el.closest('#personalDesignDock,#settingsPersonalDesignCard')||!el.id&&!el.dataset.notebookId)continue;
     const button=el.tagName==='BUTTON';
     if(!button&&!el.matches('.view,section,article')&&!/(panel|widget|card|shelf|canvas)/i.test(el.id))continue;
     const key=el.dataset.notebookId?'book:'+el.dataset.notebookId:'id:'+el.id;
     if(!/^(id:[A-Za-z][\w-]{0,100}|book:[0-9]{1,12})$/.test(key))continue;
     next.set(key,{el,name:(button?'Bouton · ':el.matches('.view')?'Page · ':'Zone · ')+label(el),kind:button?'bouton':'fond'});
   }
   const changed=next.size!==targets.size||[...next].some(([k,v])=>targets.get(k)?.el!==v.el);
   targets=next;
   for(const [key,t]of targets)t.el.dataset.designKey=key;
   if(changed){updateList();render()}
   else if(active)updateList();
 }
 function updateList(){
   $('target').replaceChildren();
   for(const [key,t]of targets){const opt=document.createElement('option');opt.value=key;opt.textContent=t.name;opt.hidden=key!=='app'&&!t.el.getClientRects().length;$('target').append(opt)}
   if(!targets.has(selected))selected='app';$('target').value=selected;
 }
 function render(){
   const rules=[];
   for(const [key,a]of Object.entries(theme)){
     if(!/^(app|header|id:[A-Za-z][\w-]{0,100}|book:[0-9]{1,12})$/.test(key)||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.src))continue;
     const selector='[data-design-key="'+key+'"]';
     const fit=['contain','cover','repeat'].includes(a.fit)?a.fit:'contain',size=Math.max(10,Math.min(200,Number(a.size)||100)),x=Math.max(0,Math.min(100,Number(a.x)||0)),y=Math.max(0,Math.min(100,Number(a.y)||0));
     rules.push(selector+'{background-image:url("'+a.src+'")!important;background-size:'+(fit==='repeat'?size+'px auto':size===100?fit:size+'% auto')+'!important;background-repeat:'+(fit==='repeat'?'repeat':'no-repeat')+'!important;background-position:'+x+'% '+y+'%!important;}');
     if(a.hideLabel&&targets.get(key)?.kind==='bouton')rules.push(selector+'{color:transparent!important;text-shadow:none!important;}'+selector+' > *{opacity:0!important;}');
   }
   style.textContent=rules.join('\n');
 }
 function point(el){
   const target=el?.closest?.('[data-design-key]');return target?.dataset.designKey||'app';
 }
 function mark(key){
   const t=targets.get(key);if(!active||!t?.el.getClientRects().length){marker.hidden=true;return}
   const r=t.el===document.body?{left:2,top:2,width:innerWidth-4,height:innerHeight-4}:t.el.getBoundingClientRect();
   marker.hidden=false;Object.assign(marker.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
 }
 function select(key){selected=targets.has(key)?key:'app';$('target').value=selected;controls();mark(selected)}
 function controls(){
   const t=targets.get(selected);if(!t)return;
   const r=t.el.getBoundingClientRect(),w=Math.round(t.el===document.body?innerWidth:r.width),h=Math.round(t.el===document.body?innerHeight:r.height);
   $('guide').textContent=t.name+' · '+w+' × '+h+' px à l’écran. Conseil : toile '+Math.min(8192,w*2)+' × '+Math.min(8192,h*2)+' px. '+(t.kind==='bouton'?'PNG transparent ; garde le centre lisible.':'PNG ou JPEG ; laisse des zones calmes derrière le texte.');
   const a=theme[selected];$('asset').textContent=a?'Dessin : '+a.name:'Aucun dessin sur cette zone.';
   for(const k of ['fit','size','x','y']){$(k).value=a?.[k]??({fit:'contain',size:100,x:50,y:50}[k]);$(k).disabled=!a||busy}
   $('hideLabel').checked=!!a?.hideLabel;$('hideLabel').disabled=!a||t.kind!=='bouton'||busy;
   for(const k of ['remove'])$(k).disabled=!a||busy;
   for(const b of dock.querySelectorAll('button'))b.disabled=busy&&b.dataset.design!=='exit';
   $('remove').disabled=!a||busy;$('undo').disabled=!history.length||busy;$('save').disabled=!dirty||busy;
 }
 function remember(){history.push(copy(theme));if(history.length>12)history.shift()}
 function change(){dirty=JSON.stringify(theme)!==JSON.stringify(saved);render();controls();status(dirty?'Aperçu non enregistré. Clique sur Enregistrer le thème pour le garder.':'Thème enregistré.');}
 function pick(value){picking=value;$('pick').setAttribute('aria-pressed',String(value));document.body.classList.toggle('personal-design-picking',value)}
 function open(){active=true;dock.hidden=false;register();updateList();select(selected);status(dirty?'Aperçu non enregistré.':'Glisse un PNG, JPEG ou WebP sur une zone.');}
 function close(){active=false;dock.hidden=true;marker.hidden=true;pick(false);if(dirty)status('Aperçu non enregistré.');}
 function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
 async function image(file,key){
   if(!file||busy)return;
   const ticket=++pendingImage;
   try{
     if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15_000_000)throw Error('Choisis un PNG, JPEG ou WebP de moins de 15 Mo. Les fichiers .clip restent dans Clip Studio Paint.');
     const bitmap=await createImageBitmap(file);
     if(bitmap.width*bitmap.height>80_000_000){bitmap.close();throw Error('Image trop grande : exporte une version de moins de 80 millions de pixels.')}
     const scale=Math.min(1,3072/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
     const src=c.toDataURL('image/webp',0.92);
     if(src.length>4_000_000)throw Error('Le dessin est trop lourd. Exporte une version plus petite.');
     if(ticket!==pendingImage)return;
     remember();theme[key]={src,name:file.name.slice(0,160),fit:targets.get(key)?.kind==='bouton'?'contain':'cover',size:100,x:50,y:50,opacity:100,hideLabel:false};select(key);change();
   }catch(e){status(e.message||'Cette image ne peut pas être ouverte.')}
 }
 async function save(){
   if(busy)return;pendingImage++;busy=true;controls();status('Enregistrement…');
   try{const response=await fetch('/api/personal-design',{method:'PUT',headers:{'Content-Type':'application/json','X-Atelier-Design':'1'},body:JSON.stringify({revision,theme})});const data=await response.json();if(!response.ok)throw Error(data.error||'Enregistrement impossible.');revision=data.revision;saved=copy(data.theme);theme=copy(saved);history=[];dirty=false;render();status('Thème enregistré sur ton installation TEST.');}
   catch(e){status(e.message+' Ton aperçu reste disponible ; tu peux l’exporter.');}
   finally{busy=false;controls()}
 }
 start.addEventListener('click',open);
 $('target').onchange=()=>select($('target').value);
 $('pick').onclick=()=>pick(!picking);
 $('exit').onclick=close;
 $('file').onclick=()=>{$('image').value='';$('image').click()};
 $('image').onchange=()=>image($('image').files[0],selected);
 $('save').onclick=save;
 $('remove').onclick=()=>{remember();delete theme[selected];change()};
 $('undo').onclick=()=>{if(history.length){theme=history.pop();change()}};
 $('revert').onclick=()=>{if(dirty&&!confirm('Abandonner l’aperçu et revenir au dernier thème enregistré ?'))return;pendingImage++;remember();theme=copy(saved);change()};
 for(const key of ['fit','size','x','y','hideLabel']){
   $(key).addEventListener('change',()=>{if(!theme[selected]||busy)return;remember();theme[selected][key]=key==='hideLabel'?$(key).checked:key==='fit'?$(key).value:Number($(key).value);change()});
 }
 $('export').onclick=()=>download('Mon-theme-Goblin.json',new Blob([JSON.stringify({format:'goblin-personal-art-v1',theme},null,2)],{type:'application/json'}));
 $('import').onclick=()=>{$('json').value='';$('json').click()};
 $('json').onchange=async()=>{
   const file=$('json').files[0];if(!file||busy)return;const ticket=++pendingImage;
   try{if(file.size>24_000_100)throw Error('Thème limité à 24 Mo.');const data=JSON.parse(await file.text());if(data.format!=='goblin-personal-art-v1'||!data.theme||Array.isArray(data.theme)||Object.keys(data.theme).length>150)throw Error('Ce fichier n’est pas un thème Goblin.');
     for(const [key,a]of Object.entries(data.theme))if(!/^(app|header|id:[A-Za-z][\w-]{0,100}|book:[0-9]{1,12})$/.test(key)||!a||typeof a.name!=='string'||a.name.length>160||typeof a.src!=='string'||a.src.length>4_000_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.src)||!['contain','cover','repeat'].includes(a.fit)||!['size','x','y'].every(k=>Number.isFinite(a[k])))throw Error('Ce thème contient un dessin ou un réglage invalide.');
     if(ticket!==pendingImage||busy)return;remember();theme=copy(data.theme);change();status('Thème importé en aperçu. Enregistre-le pour le garder.');
   }catch(e){status(e.message||'Fichier illisible.')}
 };
 $('template').onclick=()=>{
   const t=targets.get(selected),r=t.el.getBoundingClientRect(),w=Math.max(1,Math.min(8192,Math.round((selected==='app'?innerWidth:r.width)*2))),h=Math.max(1,Math.min(8192,Math.round((selected==='app'?innerHeight:r.height)*2)));
   const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.strokeStyle='#908470';ctx.lineWidth=2;ctx.setLineDash([12,8]);ctx.strokeRect(w*.1,h*.1,w*.8,h*.8);ctx.fillStyle='#908470';ctx.font=Math.min(28,Math.max(10,h/8))+'px sans-serif';ctx.fillText('Repères : à masquer avant export',w*.12,h*.5);
   c.toBlob(blob=>{if(blob)download('Gabarit-Goblin-'+w+'x'+h+'.png',blob)},'image/png');status('Ouvre le gabarit dans Clip Studio Paint et dessine sur un nouveau calque. Masque les repères avant ton export.');
 };
 document.addEventListener('pointermove',e=>{if(active&&picking&&!dock.contains(e.target))mark(point(e.target))});
 document.addEventListener('click',e=>{if(active&&picking&&!dock.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();select(point(e.target));pick(false)}},true);
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){e.preventDefault();if(picking){pick(false);mark(selected)}else close()}},true);
 document.addEventListener('dragover',e=>{if(active&&e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';if(!dock.contains(e.target))mark(point(e.target))}},true);
 document.addEventListener('drop',e=>{if(!active||!e.dataTransfer?.files.length)return;e.preventDefault();e.stopImmediatePropagation();image(e.dataTransfer.files[0],dock.contains(e.target)?selected:point(e.target));pick(false)},true);
 addEventListener('resize',()=>{if(active){controls();mark(selected)}});addEventListener('scroll',()=>{if(active)mark(selected)},true);
 addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 let timer;new MutationObserver(records=>{if(records.every(r=>dock.contains(r.target)||r.target===style||r.target===marker))return;clearTimeout(timer);timer=setTimeout(register,120)}).observe(document.body,{childList:true,subtree:true});
 // During a save, freeze only the creation controls. Normal navigation remains usable.
 dock.addEventListener('click',e=>{if(busy&&e.target.closest('button')?.dataset.design!=='exit'){e.preventDefault();e.stopImmediatePropagation()}},true);
 fetch('/api/personal-design',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Lecture du thème impossible.');
   if(!data.available){const nav=document.querySelector('.atelier-settings-nav [data-target="settingsPersonalDesignCard"]');nav?.remove();const wasVisible=!card.hidden;card.remove();if(wasVisible)document.querySelector('.atelier-settings-nav button')?.click();return}
   revision=data.revision;theme=copy(data.theme);saved=copy(theme);register();render();start.disabled=false;document.querySelector('#personalDesignAvailability').textContent='Disponible sur ton installation TEST. Tes dessins restent sur cet ordinateur et dans les sauvegardes de cette installation.';
 }).catch(e=>{document.querySelector('#personalDesignAvailability').textContent=e.message+' La sauvegarde existante a été conservée.'});
})();
