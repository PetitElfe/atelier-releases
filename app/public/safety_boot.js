/* Recovery changes only this origin. Reviewed restored browser data is applied once. */
window.atelierSafetyReady=(async()=>{
 const response=await fetch('/api/safety/browser-recovery',{cache:'no-store'});if(!response.ok)throw Error('Lecture des réglages restaurés impossible.');
 const pending=await response.json();if(!pending.token)return;
 const cover=document.createElement('div');cover.id='safetyRecoveryCover';cover.textContent='Récupération des réglages de ton interface…';cover.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#17241b;color:#f0eadb;display:grid;place-items:center;font:18px system-ui';document.body.append(cover);
 const browser=pending.browser||{},entries=browser.local_storage;
 if(entries){if(typeof entries!=='object'||Array.isArray(entries)||Object.values(entries).some(v=>typeof v!=='string'))throw Error('Préférences de sauvegarde incorrectes.');localStorage.clear();for(const [k,v]of Object.entries(entries))localStorage.setItem(k,v)}
 const drafts=browser.moodboard_drafts;
 if(Array.isArray(drafts))await new Promise((resolve,reject)=>{const request=indexedDB.open('atelier-domain-moodboard-drafts-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');store.clear();for(const [key,value]of drafts)store.put(value,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
 const ack=await fetch('/api/safety/browser-recovered',{method:'POST',headers:{'Content-Type':'application/json','X-Atelier-Safety':'1'},body:JSON.stringify({token:pending.token})});if(!ack.ok)throw Error('La restauration des réglages reste à confirmer.');location.reload();await new Promise(()=>{});
})();
window.atelierSafetyReady.catch(error=>{const cover=document.getElementById('safetyRecoveryCover');if(cover)cover.textContent='Les données sont restaurées, mais les réglages de l’interface demandent une vérification : '+error.message;console.error(error)});
