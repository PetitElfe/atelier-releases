/* Phone list owns its rendering; no cards or editor controls in a shopping row. */
(()=>{'use strict';let client=null,binding=null,host=null,wasActive=false;
const previous=render;
function legacyNotice(content){
 document.getElementById('groceryLegacyPending')?.remove();
 const pending=(window.StudioVault?.pending()||[]).filter(j=>j.base===pcUrl&&j.action.startsWith('shopping-'));
 const old=(state.shopping||[]).filter(r=>!r.grocery_key||!(client?.state.importedLegacy||[]).includes(r.grocery_key));
 if(!pending.length&&!old.length)return;
 const box=document.createElement('aside');box.id='groceryLegacyPending';box.className='grocery-sync';
 if(pending.length){const text=document.createElement('p');text.textContent='Anciennes saisies conservées en attente de connexion : '+pending.map(j=>j.payload.name||'article modifié').join(', ');const retry=document.createElement('button');retry.textContent='Synchroniser ces saisies';retry.onclick=async()=>{await StudioVault.drain();await client?.pull();render()};box.append(text,retry)}
 if(old.length){const text=document.createElement('p');text.textContent='Ancienne liste locale conservée : '+old.map(r=>r.text).join(', ');const take=document.createElement('button');take.textContent='Reprendre mes anciennes courses';take.onclick=()=>{for(const row of old)row.grocery_key||='legacy-'+crypto.randomUUID();save();client.importLegacy(old.map(r=>({...r,key:r.grocery_key})));legacyNotice(content)};box.append(text,take)}
 content.prepend(box)
}
window.openGroceryInventory=()=>{state.page='connected';tab='shopping';render();client?.openInventory()};
render=function(){
 const active=state.page==='shopping'||state.page==='connected'&&tab==='shopping';
 document.body.classList.toggle('shopping-focus',active);
 if(!active){wasActive=false;return previous()}
 if(!wasActive){wasActive=true;previous()}
 const content=document.getElementById('content'),base=pcUrl||'';
 document.getElementById('title').textContent='Courses';document.getElementById('subtitle').textContent='';
 for(const b of document.querySelectorAll('[data-mobile-go]'))b.classList.toggle('active',b.dataset.mobileSection==='shopping');
 if(client&&binding===base){if(!host.isConnected)content.replaceChildren(host);legacyNotice(content);client.render();return}
 client?.dispose();content.replaceChildren();host=document.createElement('div');content.append(host);binding=base;
 const key='goblin-groceries-v1:'+base,offline='goblin-groceries-v1:';
 if(base&&!localStorage.getItem(key)&&localStorage.getItem(offline))localStorage.setItem(key,localStorage.getItem(offline));
 if(!base){const connect=document.createElement('button');connect.textContent='Relier mon PC';connect.onclick=()=>{state.page='settings';render()};content.prepend(connect)}
 client=GoblinGroceries({root:host,storageKey:key,quietStatus:true,request:async(method,path,body)=>{if(!base)throw Error('Relie ton PC dans les paramètres pour synchroniser.');return callPc(method,path,body,base)},nativeSync:foods=>{if(base!==pcUrl)return;try{window.AtelierFoods?.sync(JSON.stringify(foods))}catch{}},requestNotifications:()=>window.AtelierFoods?.requestPermission(),testNotifications:window.AtelierFoods?()=>window.AtelierFoods.test():null});
 window.atelierGroceries=client;legacyNotice(content);
};
const resume=window.__atelierOnResume;window.__atelierOnResume=()=>{resume?.();client?.drain();client?.pull()};
render();
})();
