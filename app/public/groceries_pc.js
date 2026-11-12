(()=>{'use strict';let client,host;
function install(){const panel=document.getElementById('shoppingPanel');if(!panel)return;if(!host){host=document.createElement('div');host.id='groceryDesktop';for(const child of panel.children)if(!child.classList.contains('layout-controls'))child.classList.add('grocery-legacy');panel.append(host);client=GoblinGroceries({root:host,storageKey:'atelier-groceries-pc:'+location.origin,request:(method,path,data)=>api(path,{method,...(data?{body:JSON.stringify(data)}:{})})});window.atelierGroceries=client;}}
const old=renderKitchen;renderKitchen=function(){old();install()};window.addEventListener('studio-updated',()=>{if(state.view==='kitchen'){install();client?.pull()}});install();
})();
