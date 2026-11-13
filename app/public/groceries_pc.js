(()=>{'use strict';let client,host,lastSnapshot='',pendingRefresh=false;
async function request(method,path,data){const result=await api(path,{method,...(data?{body:JSON.stringify(data)}:{})});if(method==='POST')pendingRefresh=true;else if(path==='/api/groceries'){const signature=JSON.stringify([result.cart,result.foods]);if(signature!==lastSnapshot){lastSnapshot=signature;pendingRefresh=true}}return result}
// Keep the existing stock panel, budget and home widgets in step with phone purchases.
// Refresh after the user finishes editing, so a background reply never removes a form.
setInterval(()=>{if(!pendingRefresh||typeof globalLayoutEditing!=='undefined'&&globalLayoutEditing||document.activeElement?.matches('input,textarea,select,[contenteditable=true]')||[...document.querySelectorAll('.modal,dialog[open],.studio-menu')].some(e=>e.getClientRects().length))return;pendingRefresh=false;refresh().catch(()=>{pendingRefresh=true})},700);
function install(){const panel=document.getElementById('shoppingPanel');if(!panel)return;if(!host){host=document.createElement('div');host.id='groceryDesktop';for(const child of panel.children)if(!child.classList.contains('layout-controls'))child.classList.add('grocery-legacy');panel.append(host);client=GoblinGroceries({root:host,storageKey:'atelier-groceries-pc:'+location.origin,request});window.atelierGroceries=client;}}
const old=renderKitchen;renderKitchen=function(){old();install()};window.addEventListener('studio-updated',()=>{if(state.view==='kitchen'){install();client?.pull()}});install();
})();
