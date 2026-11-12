/* Phone list owns its rendering; no cards or editor controls in a shopping row. */
(()=>{'use strict';let client=null,binding=null,host=null;
const previous=render;
window.openGroceryInventory=()=>{state.page='connected';tab='shopping';render();client?.openInventory()};
render=function(){
 const active=state.page==='shopping'||state.page==='connected'&&tab==='shopping';
 document.body.classList.toggle('shopping-focus',active);
 if(!active){client?.dispose();client=null;binding=null;host=null;return previous()}
 const content=document.getElementById('content'),base=pcUrl||'';
 document.getElementById('title').textContent='Courses';document.getElementById('subtitle').textContent='';
 for(const b of document.querySelectorAll('[data-mobile-go]'))b.classList.toggle('active',b.dataset.mobileSection==='shopping');
 if(client&&binding===base&&host?.isConnected){client.render();return}
 client?.dispose();content.replaceChildren();host=document.createElement('div');content.append(host);binding=base;
 const key='goblin-groceries-v1:'+base,offline='goblin-groceries-v1:';
 if(base&&!localStorage.getItem(key)&&localStorage.getItem(offline))localStorage.setItem(key,localStorage.getItem(offline));
 if(!base){const connect=document.createElement('button');connect.textContent='Relier mon PC';connect.onclick=()=>{state.page='settings';render()};content.prepend(connect)}
 client=GoblinGroceries({root:host,storageKey:key,request:async(method,path,body)=>{if(!base)throw Error('Relie ton PC dans les paramètres pour synchroniser.');return callPc(method,path,body,base)},nativeSync:foods=>{try{window.AtelierFoods?.sync(JSON.stringify(foods))}catch{}},requestNotifications:()=>window.AtelierFoods?.requestPermission()});
 window.atelierGroceries=client;
};
const resume=window.__atelierOnResume;window.__atelierOnResume=()=>{resume?.();client?.drain();client?.pull()};
render();
})();
