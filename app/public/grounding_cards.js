/* Short, optional cards adapted from the Ancrage v3.1 sheet supplied by Misu.
   Source: Dr Igor Thiriez, 21 November 2021. No answer enters the shared studio. */
(()=>{'use strict';
 const groups=[['orient','Me situer'],['senses','Mes sens'],['move','Me déplacer'],['contact','Bouger un peu'],['speak','Parler ou lire'],['feel','Ressentir'],['think','Imaginer'],['remember','Mes souvenirs']];
 const rows=[
 ['orient','place','Le lieu où je suis','Regarde autour de toi. Tu peux nommer le lieu où tu te trouves, à voix haute ou dans ta tête.'],
 ['orient','date','La date et l’heure','Regarde la date et l’heure, puis nomme-les si tu en as envie.'],
 ['orient','name','Mon prénom','Tu peux te rappeler ton prénom et le dire, ou simplement le penser.'],
 ['orient','known','Un repère connu','Pense à une personne publique que tu connais et rappelle-toi son nom.'],
 ['senses','see','Cinq choses que je vois','Regarde autour de toi. Nomme jusqu’à cinq choses que tu peux voir.'],
 ['senses','hear','Quatre sons','Écoute ce qui est déjà là. Tu peux nommer jusqu’à quatre choses que tu entends.'],
 ['senses','touch','Trois contacts','Repère jusqu’à trois choses que tu peux toucher ou sentir contre toi.'],
 ['senses','smell','Deux odeurs','Si des odeurs sont présentes et agréables, tu peux en repérer jusqu’à deux.'],
 ['senses','taste','Une saveur','Remarque une saveur déjà présente, si tu en perçois une. Tu peux aussi passer cette carte.'],
 ['move','stretch','M’étirer doucement','Si c’est confortable, étire une partie de ton corps sans forcer, puis relâche.'],
 ['move','steps','Quelques pas sur place','Si tu en as envie et que tu es stable, fais quelques pas sur place et remarque le contact du sol.'],
 ['move','walk','Marcher lentement','Tu peux marcher doucement et suivre tes pas : droite, gauche, ou en les comptant.'],
 ['move','water','Le contact de l’eau','Si c’est accessible et agréable, fais couler de l’eau sur tes mains ou rafraîchis doucement ton visage.'],
 ['move','wash','Une douche ou un bain','Si cela te convient maintenant, tu peux choisir une douche ou un bain à une température confortable.'],
 ['move','activity','Un mouvement familier','Si tu en as envie, choisis une activité physique familière et adaptée à ce que tu peux faire maintenant.'],
 ['contact','hands','Serrer puis relâcher','Tu peux fermer doucement les mains, puis les relâcher. Observe la différence de sensation.'],
 ['contact','chair','Mon point d’appui','Pose les mains sur ta chaise ou sur un support stable. Remarque sa forme et son contact, sans forcer.'],
 ['contact','feet','Mes pieds au sol','Remarque le poids et les appuis de tes pieds sur le sol. Tu peux porter ton attention sur tes talons.'],
 ['contact','object','Un objet agréable','Si tu as un objet agréable au toucher, prends-le et observe ses sensations : texture, forme, température.'],
 ['contact','meaning','Un objet qui compte','Regarde un objet qui a du sens pour toi, comme une photo ou un cadeau.'],
 ['contact','scent','Une odeur familière','Si cela te convient, remarque l’odeur d’un objet familier : un sachet de thé, une crème ou autre chose que tu apprécies.'],
 ['speak','kind','Quelques mots doux','Tu peux te dire une phrase gentille et encourageante, à voix haute ou intérieurement.'],
 ['speak','describe','Trois objets autour de moi','Choisis jusqu’à trois objets autour de toi. Décris leur couleur, leur forme ou un petit détail.'],
 ['speak','routine','Une activité ordinaire','Décris les étapes d’une activité quotidienne que tu connais, sans chercher à tout faire parfaitement.'],
 ['speak','read','Lire quelque chose','Tu peux lire quelques mots présents autour de toi : un livre, une affiche, une étiquette ou un panneau.'],
 ['speak','song','Un texte ou une chanson','Si tu en as envie, chante ou récite quelque chose de familier ou de réconfortant.'],
 ['feel','breath','Le souffle','Remarque simplement le contact de ton souffle, sans chercher à réussir un rythme.'],
 ['feel','clothes','Mes vêtements','Porte ton attention sur un point de contact entre ton corps et tes vêtements.'],
 ['think','shelter','Une protection imaginaire','Si cette image te convient, imagine une protection autour de toi : un lieu, des murs ou un pouvoir de ton choix.'],
 ['think','categories','Un petit jeu de catégories','Choisis une catégorie et une lettre, puis cherche quelques exemples. Par exemple : des pays commençant par A.'],
 ['think','safe','Un endroit sûr','Si tu en as envie, pense à un endroit où tu te sens en sécurité, réel ou imaginaire.'],
 ['think','pleasant','Une petite douceur ensuite','Tu peux imaginer un petit moment agréable que tu aimerais t’accorder plus tard.'],
 ['remember','memory','Un souvenir neutre ou agréable','Si cela te convient, choisis un souvenir neutre ou agréable et décris un détail.'],
 ['remember','timeline','Revenir vers le présent','Tu peux parcourir quelques repères de ta vie jusqu’au présent, comme des anniversaires successifs.'],
 ['remember','next','La prochaine petite chose','Décris une chose simple prévue dans les prochaines heures ou les prochains jours.'],
 ['remember','favorites','Ce qui me plaît','Tu peux penser à des choses, des activités ou des personnes que tu apprécies.']
 ];
 const cards=rows.map(([group,id,title,text])=>({group,id:'ancrage-'+id,title,text}));
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 function render(host,{read=()=>'',draft=()=>{},save}={}){
  const root=node('section',undefined,'grounding-viewer');root.setAttribute('aria-label','Exercices d’ancrage');host.append(root);
  root.append(node('p','Une carte à la fois. Tu peux passer tout exercice qui ne te convient pas.','grounding-intro'));
  const label=node('label','Choisir une aide'),choose=node('select');choose.setAttribute('aria-label','Choisir une aide d’ancrage');for(const [id,title]of groups){const o=node('option',title);o.value=id;choose.append(o)}label.append(choose);root.append(label);
  const card=node('article',undefined,'grounding-card'),count=node('p',undefined,'grounding-count'),heading=node('h3'),text=node('p',undefined,'grounding-prompt');
  const date=node('p',undefined,'grounding-date');card.append(count,heading,text,date);root.append(card);
  const response=node('details',undefined,'grounding-response'),summary=node('summary','Écrire une réponse (facultatif)'),input=node('textarea');input.maxLength=4000;input.setAttribute('aria-label','Ma réponse à cette carte');input.placeholder='Quelques mots, seulement si tu en as envie…';response.append(summary,input);
  const status=node('p','','grounding-status');status.setAttribute('role','status');root.append(response,status);
  let index=0,list=cards.filter(c=>c.group===groups[0][0]),active;
  const button=(label,action)=>{const b=node('button',label);b.type='button';b.onclick=action;return b};
  if(save){const commit=button('Garder cette réponse',async()=>{if(!input.value.trim()){status.textContent='Tu peux aussi consulter sans écrire.';return}commit.disabled=true;try{await save(active,input.value);status.textContent='Réponse conservée dans ton carnet personnel.'}catch(e){status.textContent=e.message||'La réponse reste affichée ici. Réessaie avant de quitter.'}finally{commit.disabled=false}});response.append(commit)}
  input.oninput=()=>draft(active,input.value);
  function show(){active=list[index];count.textContent=(index+1)+' / '+list.length+' · '+groups.find(g=>g[0]===active.group)[1];heading.textContent=active.title;text.textContent=active.text;date.textContent=active.id==='ancrage-date'?new Date().toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short'}):'';input.value=read(active)||'';input.setAttribute('aria-label','Ma réponse · '+active.title);response.open=false;status.textContent=''}
  const controls=node('div',undefined,'grounding-controls');controls.append(button('Précédente',()=>{index=(index+list.length-1)%list.length;show()}),button('Suivante',()=>{index=(index+1)%list.length;show()}));root.append(controls);
  choose.onchange=()=>{list=cards.filter(c=>c.group===choose.value);index=0;show()};
  let start=null;card.addEventListener('touchstart',e=>{if(e.touches.length===1)start=[e.touches[0].clientX,e.touches[0].clientY]},{passive:true});card.addEventListener('touchend',e=>{e.stopPropagation();if(!start||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];start=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){index=(index+(dx<0?1:list.length-1))%list.length;show()}});
  root.append(node('p','Adaptation courte de la fiche « Ancrage », Dr Igor Thiriez, version 3.1 du 21/11/2021, fournie par Misu.','grounding-credit'));show();return root;
 }
 window.AtelierGrounding={render,cards,groups};
})();
