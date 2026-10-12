# L’Atelier 0.12.0

Refonte de l’expérience d’écriture et de lecture des carnets.

## Écriture sans bouton Enregistrer

Les pages de carnet reviennent à une logique naturelle :
- le texte, le titre, la mise en forme, les liens et les images sont **sauvegardés automatiquement** ;
- une sauvegarde est déclenchée après une courte pause d’écriture ;
- quitter une page ou un carnet déclenche aussi une sauvegarde ;
- quand l’application passe en arrière-plan ou se ferme, L’Atelier tente une dernière sauvegarde ;
- le haut de la page indique simplement « Sauvegarde… » puis « Enregistré ».

Les boutons **Enregistrer** restent volontairement dans les éditeurs de structure : création/configuration d’un domaine, d’un carnet, d’un objectif, etc. Dans ces fenêtres, Entrée ne valide plus à la place du bouton.

## Page agrandie

Une icône **⛶** permet d’agrandir la page courante pour écrire avec beaucoup plus d’espace. La liste des pages et les modules latéraux sont masqués pendant ce mode. La même icône permet de revenir à la taille normale.

## Barre d’édition type traitement de texte

La barre d’écriture rassemble maintenant les fonctions classiques :
- annuler / rétablir ;
- styles Normal, Titre 1, Titre 2, Titre 3 et Citation ;
- polices Georgia, Arial, Verdana, Trebuchet, Courier et Times ;
- plusieurs tailles de texte ;
- gras, italique, souligné, barré ;
- exposant et indice ;
- couleur du texte ;
- surlignage ;
- alignement gauche, centré, droite et justifié ;
- listes à puces et listes numérotées ;
- retrait / diminution du retrait ;
- effacement de la mise en forme ;
- liens internes, liens web et images.

La sélection de texte est conservée lorsqu’on clique sur la barre d’outils afin que les commandes agissent réellement sur le passage sélectionné.

## Lecture tranquille

Le mode Lire n’est plus présenté comme un second éditeur. Une icône **📖** ouvre une véritable vue de lecture :
- une feuille centrée et épurée ;
- flèche gauche / droite pour tourner les pages ;
- petite animation lors du changement de page ;
- numérotation des pages ;
- champ dans lequel on peut saisir directement le numéro de la page à atteindre ;
- bouton **☰ Sommaire** ;
- le sommaire affiche toutes les pages du carnet et un clic ouvre immédiatement la page choisie ;
- l’icône ⛶ fonctionne également en lecture ;
- le crayon ✎ revient à l’écriture.

Les pages sont aussi numérotées dans la liste du carnet.

## Liens et images

Les liens restent proches visuellement du texte, sont modifiables, et les liens web s’ouvrent dans un nouvel onglet. Les liens internes conduisent à leur page cible et les backlinks restent disponibles.

Les images restent insérables, déplaçables, alignables et redimensionnables.

## Progression

Les pourcentages parents restent calculés automatiquement depuis les sous-éléments. Les éléments terminaux conservent les raccourcis 0 / 25 / 50 / 75 / 100 % et le curseur par pas de 5 %.

Aucune donnée existante n’est supprimée.
