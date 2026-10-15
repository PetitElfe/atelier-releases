# L’Atelier 0.16.3 — Défilement automatique de l’Accueil

Cette version adapte automatiquement la hauteur de l’Accueil aux modules réellement visibles, sans migration SQLite ni modification des données ou des carnets.

**ALPHA 0.16.3 :** hors mode Modifier, l’espace réservé artificiellement sous l’Accueil disparaît, ainsi que la barre de défilement si les modules tiennent à l’écran. Le mode Modifier conserve une zone temporaire pour déplacer les modules plus bas ; cette zone se retire dès « Terminer ». Si un module descend réellement sous la fenêtre, le défilement reste disponible. À l'ajout depuis la bibliothèque, les modules arrivent en haut au centre (espacés si plusieurs), et le mode Modifier s'active immédiatement ; seules les positions des modules ajoutés changent. Les commandes de « À venir » sont réparties sur deux rangées pour ne plus recouvrir les informations. Le raccourci Accueil est identifié par un pictogramme de maison et un libellé visible. Aucun réglage préexistant des autres modules n'est réinitialisé.

**ALPHA 0.16.2** : déplacement des modules sur plusieurs écrans avec défilement automatique de l'Accueil au bord de la fenêtre. L'éditeur enregistre les coordonnées corrigées de la distance de défilement. Dans « ⋯ » → réglages, le bouton « Remonter en haut de l’Accueil » permet de récupérer immédiatement un module placé trop bas. Les contrôles des petits raccourcis ne recouvrent plus leur contenu en mode Modifier. Toutes les positions et dimensions existantes sont conservées.

**Nouveau en 0.16.1 :** les modules de l'Accueil sont placés dans un canvas indépendant du flux et des grilles, ce qui évite qu'un autre module les décale après recharge. Les dimensions et positions 0.16.0 sont copiées une seule fois vers des clés `atelierHomeCanvasV2_*` ; les clés historiques ne sont ni écrasées ni supprimées. La zone conserve une hauteur adaptée au contenu. Le titre de l’onglet indique aussi la version actuelle. Les autres rubriques ne changent pas.

## Accueil
- La page se développe librement vers le bas : le défilement reste disponible sur ordinateur.
- Le bouton **＋ Bibliothèque de modules** permet d'afficher ou masquer les éléments de l'Accueil.
- Par défaut : Budget compact, Calendrier, « À venir » et Journal.
- Modules supplémentaires facultatifs : raccourcis vers Tâches, Rappels, Bibliothèque, Habitudes & cycle, Courses & repas, Recettes et Paramètres.
- Afficher ou masquer un encadré ne supprime **jamais** les informations qu'il contient.

## Personnalisation
- Dans **Modifier**, les poignées conservent les fonctions de déplacement et de redimensionnement indépendant.
- **⋯** ouvre les réglages d'un module : titre, affichage sur l'Accueil (si applicable) et retour à la disposition par défaut du module.
- Le double-clic sur un encadré non interactif ouvre les mêmes réglages en mode Modifier.
- Les remises à zéro globales demandent confirmation et restent annulables.

## Rubriques existantes
La Bibliothèque et ses carnets, le Budget, les tâches, le Calendrier, les rappels, les habitudes et le cycle, les courses, les recettes et les Paramètres restent disponibles. Leur contenu n'est pas déplacé par les raccourcis de l'Accueil.

## Données
Aucune migration SQLite ni suppression des dossiers `data` ou `user`.

**Attention :** les positions, dimensions et choix de modules sont conservés dans le stockage local du **profil de navigateur**. La sauvegarde des dossiers `data` et `user` ne contient pas ce stockage. L'application ne possède pas encore de comptes indépendants et de cloisonnement confidentiel des données sensibles.

Voir `docs/ALPHA_0.16.0_PLAN.md` à la racine du dépôt pour le cahier des charges et les scénarios de réception.
