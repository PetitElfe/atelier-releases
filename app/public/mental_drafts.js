/* Private local drafts. A failed or conflicting write never clears the text. */
const mentalDraftKey='atelier-mental-drafts-v1';
let mentalDrafts={},mentalConfirmed=null,mentalSavedFields=[];
try{mentalDrafts=JSON.parse(localStorage.getItem(mentalDraftKey)||'{}')}catch{}
function mentalPersist(){try{localStorage.setItem(mentalDraftKey,JSON.stringify(mentalDrafts));return true}catch{announce('Le stockage local est plein. Exporte tes brouillons avant de quitter.');return false}}
function mentalFieldKey(field){return JSON.stringify([category,editing?.kind||'',editing?.id||'',field.closest('[data-draft-card]')?.dataset.draftCard||'',field.placeholder])}
function mentalCapture(){for(const f of document.querySelectorAll('#editor input,#editor textarea,#entries textarea')){const key=mentalFieldKey(f);if(f.value)mentalDrafts[key]=f.value;else delete mentalDrafts[key]}mentalDrafts.context={category,editing};mentalPersist()}
function mentalExport(){mentalCapture();const blob=new Blob([JSON.stringify({format:'atelier-mental-drafts-v1',...mentalDrafts},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Goblin-brouillons-carnet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const mentalBar=node('div','','row');mentalBar.append(button('Exporter mes brouillons',mentalExport));$('notice').after(mentalBar);
const mentalOldRender=render;
render=function(){mentalOldRender();for(const f of document.querySelectorAll('#editor input,#editor textarea,#entries textarea')){const v=mentalDrafts[mentalFieldKey(f)];if(typeof v==='string')f.value=v}mentalBar.querySelector('[data-recovery]')?.remove();if(mentalDrafts.pending){const recover=button('Revoir ma sauvegarde non envoyée',()=>{if(!confirm('Rouvrir la version locale non envoyée ? Le PC ne sera modifié qu’après un nouvel enregistrement.'))return;data=structuredClone(mentalDrafts.pending.data);rev=mentalDrafts.pending.rev;render();announce('Version locale rouverte. Si le PC a changé, l’enregistrement sera refusé et tes brouillons resteront disponibles.');});recover.dataset.recovery='1';mentalBar.append(recover)}};
document.addEventListener('input',e=>{if(e.target.matches('#editor input,#editor textarea,#entries textarea'))mentalCapture()});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;mentalCapture();const area=b.closest('article')||b.closest('#editor');mentalSavedFields=area?[...area.querySelectorAll('input,textarea')].map(mentalFieldKey):[]},true);
const mentalOldPull=pull;
pull=async function(){mentalCapture();await mentalOldPull();mentalConfirmed=structuredClone(data)};
const mentalOldWrite=write;
write=async function(){mentalCapture();mentalDrafts.pending={data:structuredClone(data),rev};mentalPersist();let ok=false;try{ok=await mentalOldWrite()}catch{announce('Connexion interrompue. Le texte et la version non envoyée sont conservés dans tes brouillons.')}if(ok){mentalConfirmed=structuredClone(data);delete mentalDrafts.pending;for(const key of mentalSavedFields)delete mentalDrafts[key];mentalPersist()}else{if(mentalConfirmed)data=structuredClone(mentalConfirmed);render()}return ok};
window.addEventListener('pagehide',mentalCapture);
const mentalContext=mentalDrafts.context;if(mentalContext&&groups.some(g=>g[0]===mentalContext.category)){category=mentalContext.category;editing=mentalContext.editing||null}
