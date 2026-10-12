# L’Atelier 0.11.0

Grand correctif de la Bibliothèque et nouvel éditeur de carnets.

## Éditeur de page

Les pages fonctionnent maintenant davantage comme un petit traitement de texte :
- **sauvegarde manuelle** avec un vrai bouton « Enregistrer » ;
- Entrée crée une nouvelle ligne et ne valide pas la page ;
- indicateur clair « Enregistré » / « Modifications non enregistrées » ;
- bouton pour annuler les modifications non enregistrées ;
- changement de page ou de carnet bloqué tant que la page courante n’est pas enregistrée ou annulée, afin d’éviter une perte de texte.

## Mise en forme

Le texte peut maintenant recevoir :
- gras ;
- italique ;
- soulignement ;
- plusieurs polices : Georgia, Arial, Verdana, Trebuchet et Courier ;
- taille de texte ;
- couleur de texte libre ;
- couleur de surlignage libre ;
- alignement gauche, centré, droite ou justifié.

La mise en forme est enregistrée avec la page.

## Liens

Les liens ont été rapprochés visuellement du texte : plus de gros encadré différent du reste de la page.

Pour les liens internes :
- mot / texte libre ;
- type de lien libre : Vocabulaire, Exemple, Prérequis, Référence, etc. ;
- cible modifiable ;
- clic en mode Lire ouvre la page cible ;
- en mode Écrire, cliquer sélectionne le lien puis les boutons « Ouvrir » et « Modifier » deviennent disponibles ;
- double-clic permet aussi de modifier le lien ;
- le lien peut être retiré sans supprimer le mot ;
- les backlinks « Liens vers cette page » restent disponibles.

Pour les liens web :
- l’URL peut être remplacée par n’importe quel mot ou groupe de mots ;
- le lien ouvre réellement le site dans un nouvel onglet en mode Lire ;
- en mode Écrire, il peut être sélectionné, ouvert ou modifié ;
- l’adresse et le texte affiché sont modifiables.

## Images dans les carnets

Une image peut être ajoutée directement dans la page :
- fichier local jusqu’à 4 Mo ;
- déplacement dans la page par glisser-déposer ;
- redimensionnement avec les boutons − / + ou avec la poignée dans le coin ;
- alignement gauche, centre ou droite ;
- suppression ;
- conservation de la taille et de la position après enregistrement.

## Progression simplifiée

Le pourcentage n’a plus besoin d’être deviné partout :
- un élément qui possède des sous-éléments calcule désormais son avancement automatiquement à partir d’eux ;
- les niveaux parents affichent « auto » ;
- pour une feuille sans sous-élément, des raccourcis 0 %, 25 %, 50 %, 75 % et 100 % sont proposés ;
- un curseur permet toujours un réglage plus précis par pas de 5 % si nécessaire ;
- 100 % passe automatiquement l’élément à « Terminé ».

L’avancée globale du domaine suit cette progression hiérarchique.

## Tâches depuis la Bibliothèque

Après l’enregistrement d’une tâche ouverte depuis un domaine, L’Atelier restaure maintenant précisément le contexte d’origine : même domaine, même carnet et même page au lieu de revenir ailleurs dans la Bibliothèque.

Aucune donnée existante n’est supprimée. Les anciennes pages texte et les anciens liens sont convertis à l’affichage vers le nouvel éditeur riche puis enregistrés dans le nouveau format lors de la prochaine sauvegarde.
