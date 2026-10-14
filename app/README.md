# L’Atelier 0.16.0 — Modules et ergonomie

Cette version consolide les fonctions existantes sans changer les données de la base SQLite ni celles des carnets.

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
