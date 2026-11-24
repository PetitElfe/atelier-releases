/* One proportional application zoom. Never rewrite the application's typography. */
(()=>{'use strict';
const root=document.documentElement,embedded=window.parent!==window;let timer;
const read=(k,d)=>{try{return localStorage.getItem(k)||d}catch{return d}};
const write=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const steps=[80,85,90,95,100,105,110,115,120,125,130,140,150,160];
const display=window.AtelierDisplay={factor:1,apply,setZoom};
function setZoom(value){write('atelier-ui-scale',String(value));apply()}
function apply(){
 const chosen=read('atelier-ui-scale','auto'),n=Number(chosen),factor=chosen!=='auto'&&steps.includes(n)?n/100:1;
 // An embedded journal is already scaled by its parent. Do not apply it twice.
 display.zoom=factor;display.factor=embedded?1:factor;root.style.zoom=String(display.factor);
 root.style.removeProperty('font-size');root.style.removeProperty('--atelier-text-factor');
 root.style.setProperty('--atelier-viewport-width',innerWidth/display.factor+'px');root.style.setProperty('--atelier-viewport-height',innerHeight/display.factor+'px');
 root.dataset.atelierCompact=String(innerWidth/display.factor<980);
 const theme=read('atelier-ui-theme','goblin');root.dataset.atelierTheme=['goblin','sage','mauve','bleu','miel'].includes(theme)?theme:'goblin';
 const font=read('atelier-ui-font','classic');root.dataset.atelierFont=font;
 root.style.setProperty('--atelier-font',({classic:"Georgia, 'Times New Roman', serif",system:'system-ui, "Segoe UI", sans-serif',arial:'Arial, sans-serif'})[font]||'Georgia,serif');
 for(const [id,key,fallback]of [['atelierUiScale','atelier-ui-scale','auto'],['atelierUiTheme','atelier-ui-theme','goblin'],['atelierUiFont','atelier-ui-font','classic']]){const control=document.getElementById(id);if(control)control.value=read(key,fallback)}
 const status=document.getElementById('atelierDisplayStatus');if(status)status.textContent=(chosen==='auto'?'Échelle Windows · ':'Zoom de l’application · ')+Math.round(factor*100)+' %';
 if(location.pathname.endsWith('mental-health.html')){root.style.setProperty('--ink','var(--text)');root.style.setProperty('--paper','var(--panel)');root.style.setProperty('--soft','var(--panel2)');root.style.setProperty('--accent','var(--gold)')}
 if(typeof applySideNavPosition==='function'){applySideNavPosition();if(document.getElementById('sideNav')?.classList.contains('is-collapsed'))setSideNavCollapsed(true)}
 if(typeof reflowHomeCanvasViewport==='function')reflowHomeCanvasViewport();
 dispatchEvent(new CustomEvent('atelier-display-changed',{detail:{factor:display.factor}}));
}
function step(direction){const value=Math.round((display.zoom||1)*100),next=direction>0?steps.find(v=>v>value):[...steps].reverse().find(v=>v<value);if(next)setZoom(next)}
addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey)return;if(['+','=','-','0'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();if(event.key==='0')setZoom(100);else step(event.key==='-'?-1:1)}},true);
addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();event.stopImmediatePropagation();step(event.deltaY<0?1:-1)},{passive:false,capture:true});
addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(apply,80)});
addEventListener('storage',event=>{if(!event.key||event.key.startsWith('atelier-ui-'))apply()});addEventListener('load',apply);apply();
})();
