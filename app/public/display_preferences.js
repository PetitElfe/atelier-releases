/* Local display preferences shared by the desktop and its embedded journal. */
(()=>{'use strict';
const root=document.documentElement, embedded=location.pathname.endsWith('mental-health.html');
const read=(k,d)=>{try{return localStorage.getItem(k)||d}catch{return d}};
const families={classic:"Georgia, 'Times New Roman', serif",system:'system-ui, "Segoe UI", sans-serif',arial:'Arial, sans-serif'};
const originals=new Map();let timer;
function visit(rules,factor){for(const rule of rules){
 if(rule.cssRules?.length)visit(rule.cssRules,factor);
 if(!rule.style)continue;
 const style=rule.style;
 if(!originals.has(style))originals.set(style,{size:style.fontSize,line:style.lineHeight});
 const original=originals.get(style),size=/^(\d+(?:\.\d+)?)px$/.exec(original.size),line=/^(\d+(?:\.\d+)?)px$/.exec(original.line);
 // CSS pixels already account for Windows display scaling. Never multiply by devicePixelRatio.
 if(size)style.fontSize=Math.max(14,Number(size[1])*factor)+'px';
 if(line)style.lineHeight='max(1.25em, '+Number(line[1])*factor+'px)';
}}
function apply(){
 const chosen=read('atelier-ui-scale','auto'),number=Number(chosen);
 const automatic=innerWidth>=2400&&innerHeight>=1000?1.25:innerWidth>=1800&&innerHeight>=900?1.1:1;
 const factor=chosen==='auto'||!Number.isFinite(number)||number<80||number>160?automatic:number/100;
 const theme=read('atelier-ui-theme','goblin');root.dataset.atelierTheme=['goblin','sage','mauve','bleu','miel'].includes(theme)?theme:'goblin';
 root.style.zoom='';document.querySelectorAll('main .view').forEach(v=>v.style.zoom='');
 root.style.setProperty('--atelier-text-factor',factor);root.style.setProperty('--atelier-font',families[read('atelier-ui-font','classic')]||families.classic);
 root.style.fontSize=Math.max(14,16*factor)+'px';
 for(const sheet of document.styleSheets){try{visit(sheet.cssRules,factor)}catch{/* Ignore cross-origin sheets. */}}
 const status=document.getElementById('atelierDisplayStatus');if(status)status.textContent=(chosen==='auto'?'Automatique · ':'')+Math.round(factor*100)+' % · fenêtre '+innerWidth+' × '+innerHeight+' · texte de 14 px minimum';
 if(embedded){root.style.setProperty('--ink','var(--text)');root.style.setProperty('--paper','var(--panel)');root.style.setProperty('--soft','var(--panel2)');root.style.setProperty('--accent','var(--gold)')}
}
window.AtelierDisplay={apply};apply();
addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(apply,100)});addEventListener('storage',e=>{if(!e.key||e.key.startsWith('atelier-ui-'))apply()});addEventListener('load',apply);
})();
