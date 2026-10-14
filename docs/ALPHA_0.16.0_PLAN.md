# L’Atelier — Plan et suivi ALPHA 0.16.0

## Portée convenue
Grosse livraison unique de consolidation des fonctions **déjà discutées**, sans refonte artistique, sans images d'IA et sans ajout de nouvelles catégories d'outils. L'installation locale 0.15.3 reste stable tant que le travail est en cours.

### Travaux sur la branche 0.16.0
- Accueil extensible verticalement : supprimer la limitation de hauteur et autoriser le défilement.
- Bibliothèque de modules : l'utilisateur choisit ce qui figure sur l'Accueil (Budget, Calendrier, À venir, Journal ; raccourcis vers sept rubriques existantes).
- Contrôle des modules depuis l'Accueil : ajouter/masquer, sans suppression des contenus, avec état conservé après redémarrage dans le même profil de navigateur.
- Gestion de chaque encadré : bouton « ⋯ » et double-clic en mode Modifier, titre personnalisable, possibilité de masquer les modules de l'Accueil, et réinitialisation individuelle confirmée.
- Continuité du système 0.15.3 : déplacement, redimensionnement horizontal/vertical, noms personnalisés, confirmation et annulation de la remise à zéro.
- Régressions multi-rubriques : Bibliothèque/carnets, Budget, Calendrier, tâches/rappels, suivi des habitudes, cuisine/courses et Paramètres restent couverts par les scénarios existants.
- Une seule publication et checklist utilisateur, **après** validation GitHub + fermeture locale + sauvegarde datée de `E:\\00_LATELIER\\data` et `E:\\00_LATELIER\\user`.

## Limites et sécurité
- Les raccourcis de modules ne déplacent **aucune donnée** d'une rubrique à l'autre ; ils ouvrent simplement les fonctionnalités existantes.
- Les personnalisations de modules restent dans `localStorage` du navigateur et **ne font pas partie** des copies `data` / `user`. Leur synchronisation entre navigateurs/comptes n'est pas implémentée.
- Les comptes utilisateurs isolés et la confidentialité des données médicales constituent un chantier distinct ; l'instance actuelle reste commune.
- Pas de suppression de dossiers locaux ni migration de base de données pour cette version.
- Aucun commit direct sur `main` avant validation et sauvegarde.

## Vérifications de réception
1. Accueil défilable, modules présents au démarrage.
2. Choix des modules affichés, masquage réversible, aucune suppression des données.
3. Position, largeur, hauteur et titre conservés après redémarrage.
4. « ⋯ » et double-clic ouvrent les réglages individuels en mode Modifier.
5. Navigation bloquée pendant le déplacement ; navigation rétablie hors mode Modifier.
6. Rétrocompatibilité des anciennes dispositions et des noms personnalisés.
7. Tests navigateur : lecture/écriture des carnets, enregistrements calendrier, budget, habitudes, cuisine, réglages.
