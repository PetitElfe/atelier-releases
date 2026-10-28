# L’Atelier du Goblin — GRANDE CHECKLIST DE VALIDATION ALPHA 0.18
Date de préparation : 28 octobre 2026. Support : quatre captures annotées + passation du 27/28 octobre + audit visuel du Drive.
**Aucune case n’est réputée validée sur Windows TEST, Nathan ou Android.** L’état « tests CI réussis » ne vaut pas test humain.
## Règles du test
- Tester exclusivement la version **TEST** `E:\LATELIER_TEST_0180\code_0180` / port **8876** ; ne jamais modifier la **stable 0.17.0** `E:\00_LATELIER` / port **8765**.
- L’application de Nathan (port **8877**) a ses propres fichiers et données ; vérifier à part, avec son accord.
- Faire une sauvegarde avant mise à jour ou migration, noter la version affichée dans **Paramètres** et conserver les données réelles.
- Pour chaque échec : noter étape, comportement attendu/observé, capture, taille de fenêtre, date/heure et si un F5 change le résultat.
- Ne cocher qu’après **test manuel réussi**, et inscrire « à corriger » à côté en cas d’échec.

## A. Installation, données et mises à jour
- [ ] TEST : ouvrir la bonne installation, vérifier port, version, canal et chemin dans Paramètres.
- [ ] Stable 0.17.0 : confirmer inchangée et démarrant toujours avec ses données.
- [ ] Vérifier sauvegarde avant migration et restauration possible d’une copie TEST.
- [ ] Rechercher la mise à jour depuis Paramètres, installer sans ZIP à recopier, redémarrer et voir la nouvelle interface.
- [ ] Fermer/réouvrir TEST, faire F5/rechargement complet, vérifier l’absence d’ancien cache.
- [ ] Toutes les tâches, rendez-vous, post-it, tracker/archives et préférences restent présents.
- [ ] Nathan : vérifier séparément l’indication de mise à jour, l’installation et le redémarrage ; aucun mélange de comptes/données.

## B. Calendrier mensuel — capture 3
- [ ] Le titre du mois et les flèches précédente/suivante sont **regroupés et centrés** ; le bouton Aujourd’hui ne casse pas l’alignement.
- [ ] Flèche précédente -> mois précédent, flèche suivante -> mois suivant, y compris décembre/janvier et février bissextile.
- [ ] « Aujourd’hui » revient au bon jour et au bon mois.
- [ ] Le mois ne présente pas de titre « Calendrier » redondant encombrant l’en-tête.
- [ ] Une grille lundi→dimanche, jours hors mois atténués, date d’aujourd’hui lisible, aucune colonne compressée.
- [ ] Cliquer sur + d’un jour crée le rendez-vous **à la bonne date**.
- [ ] Trois rendez-vous affichés max par jour ; + autres affiche la **liste complète**.
- [ ] Un rendez-vous est cliquable, son titre et ses horaires lisibles ; plusieurs sur le même jour ne se masquent pas.
- [ ] Les statuts effectué/annulé et les couleurs restent identiques après rafraîchissement.
- [ ] Cliquer un lien URL d’un rendez-vous ouvre une URL http(s) ; une URL invalide est refusée.
- [ ] Glisser-déposer un rendez-vous (et son rappel lié) vers un autre jour ne perd pas le lien.
- [ ] Les jours du cycle enregistrés et estimés sont distincts ; les prévisions ne deviennent pas des enregistrements confirmés.
- [ ] Les préférences d’affichage du cycle sont indépendantes et gardées après F5.

## C. Semainier — capture 1
- [ ] Semaine lundi→dimanche correcte, flèches, retour Aujourd’hui, passage Mois/Semaine.
- [ ] En-têtes des jours compacts sans « Aujourd’hui » recouvrant les dates/événements.
- [ ] Heures 07:00→22:00 et plages jusqu’à 23:00 avec lignes horaires régulières sur toute la largeur.
- [ ] Demi-heures visuellement repérables ; la longueur verticale d’un événement reflète sa durée.
- [ ] Événements de 15, 30, 60 minutes et événement de plusieurs heures : nom et heure accessibles au survol/clavier/clic.
- [ ] Deux événements qui se chevauchent restent séparés et ouvrables.
- [ ] Rendez-vous terminé/annulé reste visible mais identifiable, non supprimé.
- [ ] Un rendez-vous toute la journée est dans l’en-tête, pas à 07:00.
- [ ] Les éléments avec heure ne sont pas tronqués sans moyen d’afficher leur titre complet.
- [ ] La semaine reste exploitable sur écran 1080p, 2K, fenêtre rétrécie et zoom 125/150 %.
- [ ] Navigation verticale dans les horaires sans décalage des colonnes/jours ; horizontal seulement si nécessaire.
- [ ] Clic/drag/création à une heure exacte ; un changement de date garde durée et rappels.
- [ ] + Rendez-vous fonctionne sans doublon et sans ouvrir une liste parasite.

## D. Trackers — capture 2 et PR #84/#85
- [ ] Le gros texte d’introduction ne prend plus la place des tableaux.
- [ ] « + Nouveau tableau » ouvre/ferme le formulaire ; saisie et création aboutissent au bon tableau.
- [ ] Plusieurs tableaux (Habitudes, Ménage, Projets) avec couleurs indépendantes et noms conservés.
- [ ] Créer un tableau à 1 semaine, 2 semaines, 1 mois, 2 mois, 1 an et durée personnalisée.
- [ ] Le mois/intervalle de **chaque tableau** et ses flèches sont alignés et faciles à lire.
- [ ] Une navigation de tableau ne déplace pas les autres tableaux.
- [ ] La navigation globale du mois n’efface aucune coche ; Retour ce mois-ci fonctionne.
- [ ] Clic droit sur un tableau : menu d’actions clair ; archivage avec confirmation.
- [ ] Archiver puis restaurer depuis Paramètres > Archives sans perdre lignes, valeurs ni marques.
- [ ] Le tableau et les dates restent lisibles malgré 31 colonnes ; défilement horizontal utilisable.
- [ ] Noms de lignes longs lisibles, sans chevauchement ; cellules assez grandes et contrastées.
- [ ] Coche simple en un clic, décocher, F5, quitter/réouvrir : même état.
- [ ] Rituel facultatif de plusieurs sous-étapes : case finale validée seulement quand tout est terminé.
- [ ] Compteur « Numéro » : choisir nom/unité/objectif 10, chaque clic +1, validation à 10 seulement ; −1 et remise à zéro.
- [ ] Chiffre libre historique : édition possible sans être forcée en compteur à cible.
- [ ] Jour fixe par ligne (ex. mardi poubelles) : les autres jours sont grisés et rejetés aussi par l’API.
- [ ] Ligne liée à Tâche/Objectif/Administratif ouvre la bonne fiche sans duplication.
- [ ] Aucun Tracker n’est recoplié artificiellement dans le journal ; accueil et grille partagent le même état SQLite.
- [ ] Archives du mois écoulé montrent un bilan du type 28/30, calculé uniquement sur les jours éligibles.
- [ ] Les anciens Trackers de valeurs datées restent consultables et intacts.
- [ ] Pas de rubrique Préparatifs autonome ni de préparatifs de rendez-vous dans l’interface ; données historiques non effacées.

## E. Accueil / journal — capture 4
- [ ] Bouton Accueil et pictogramme reviennent tous deux à l’accueil en un clic.
- [ ] En-tête « Atelier / Accueil / niveau XP / date / actions » sans texte superposé ni coupé en 1080p et 2K.
- [ ] Niveau et XP lisibles ; indicateur d’information/précision non masqué.
- [ ] Modules déplacés seulement en mode Modifier ; état normal cliquable.
- [ ] Bibliothèque de modules, ajout et affichage sans doublons ni disparition après F5.
- [ ] Widget rendez-vous : voir la liste complète en cliquant « Tout voir » ; si plusieurs, défilement réel.
- [ ] Widget budget et calendrier compact ouvrent le module attendu.
- [ ] Journal garde l’apparence d’un livre ouvert, pas deux blocs indépendants.
- [ ] Journal s’adapte à la largeur/hauteur de la carte sans pages vides ni zone beige tronquée.
- [ ] Les échéances du jour s’affichent avec l’heure **en fin de ligne**, sans chevaucher « Aujourd’hui ».
- [ ] Cocher une tâche dans le journal met immédiatement à jour la même tâche partout.
- [ ] Si plus de tâches que la place : défilement interne sans couper le bouton ou le bas du livre.
- [ ] Feuilleter pages 1–2 ↔ 3–4 et revenir à aujourd’hui ; pas de rupture d’animation ni texte perdu.
- [ ] Les suggestions d’objectifs restent lisibles et ne chevauchent pas les idées de repas.
- [ ] « Mes coches du jour » : entrée du jour + lien Tout voir, coche synchronisée à Trackers.
- [ ] Si accueil vide / plein : pas de rognage à gauche ni scroll horizontal inattendu après F5.
- [ ] Format plein écran/réduction fenêtre 1080p, 2K, 4K : positions conservées et carte visible.

## F. Poignées façon éditeur (fonctions intégrées par la PR #88 ; vérification manuelle attendue)
- [ ] Dans Modifier, tous les côtés et coins offrent le curseur ↔, ↕ ou diagonal adapté.
- [ ] Tirer bord droit conserve bord gauche ; tirer bord gauche conserve bord droit (idem haut/bas).
- [ ] Tirer chaque coin redimensionne de façon prévisible, sans saut au premier mouvement ni inversion.
- [ ] Modules Journal, Calendrier, Budget, Trackers : comportement cohérent et limites min/max.
- [ ] Après F5/redémarrage/retour du mode Modifier : tailles et positions identiques.
- [ ] Réinitialisation propose une vraie possibilité d’annuler ; aucune disposition écrasée silencieusement.

## G. Post-it, capture rapide et archives
- [ ] Sur Windows, les post-it restent sur le bureau (pas affichés dans l’Atelier).
- [ ] Entrée normale ET Entrée du pavé numérique donnent des lignes distinctes, sauvegardées.
- [ ] Cadenas protège les positions contre un glisser accidentel ; déverrouillage fonctionne.
- [ ] Post-it archivé conserve texte, sauts de ligne, couleur et emplacement à la restauration.
- [ ] Accès aux archives directement depuis Paramètres, même après archivage du dernier post-it.
- [ ] Archiver ≠ supprimer définitivement ; aucun effacement sans confirmation claire.
- [ ] Zone de notification discrète, aucune fenêtre gênante dans la barre des tâches.
- [ ] Capture rapide depuis plume/clic/raccourci choisi ; clavier global si activé.
- [ ] #Carnet, #Tâches, #Rappels, #Post-it, #Administratif, #Tracker : classement réel ou boîte d’attente explicitée.
- [ ] Texte multiligne conservé, destination visuellement marquée jusqu’à consultation.
- [ ] Plusieurs captures consécutives sans écrasement ou doublon.

## H. Administratif et autres modules
- [ ] Créer, modifier nom/catégorie/échéance/notes, marquer terminé, archiver et restaurer une démarche ; les pièces et le rendez-vous restent intacts.
- [ ] Lier Administratif ↔ Calendrier sans transformer arbitrairement une démarche en faux rendez-vous.
- [ ] Pièces jointes locales de démarche (PDF, PNG, JPEG, TXT jusqu’à 4 Mo) : ajout, téléchargement, retrait confirmé, sauvegarde et sécurité. Les pièces directement jointes à un événement restent distinctes et non développées.
- [ ] Tâches : création, listes, vues Aujourd’hui/Toutes, priorités, récurrence par occurrence, coche synchronisée.
- [ ] Rendez-vous : rappels configurables, statut et préparation historique non détruite après modification.
- [ ] Bibliothèque/Objectifs : arborescence, sous-objectifs, liens, progression et accès depuis l’accueil.
- [ ] Cuisine/Courses/Repas/Budget : pas de régression des valeurs, menus et interactions.
- [ ] Notifications : son facultatif et bouton test Windows ; désactivation effective.
- [ ] Android : synchronisation Wi-Fi, retour après arrière-plan, notifications sonores **natives** (ne pas confondre avec navigateur).
- [ ] Sauvegarde/restauration complète TEST sur copie, y compris documents joints quand la fonction existera.

## Tableau de suivi des problèmes
| Identifiant | Partie | Résultat réel (OK / KO / non testé) | Capture / description | Correctif / commit |
| --- | --- | --- | --- | --- |
| V01 | Mois | non testé | | |
| V02 | Semaine | non testé | | |
| V03 | Trackers | non testé | | |
| V04 | Accueil / journal | non testé | | |
| V05 | Modifier / poignées | non testé | | |
| V06 | Post-it / archives | non testé | | |
| V07 | Installation / données | non testé | | |
| V08 | Admin / Calendrier / documents | non testé | | |
| V09 | Nathan / Android | non testé | | |

**Statut technique de référence :** #84, #85, #86, #87 et #88 fusionnées dans `feature/0180-progression-foundations` (ALPHA). #89 traite les archives et l’édition des démarches. #78 est toujours un brouillon expérimental historique, partiellement repris dans #88. La branche `main` est la stable. Une CI verte ne coche aucune case de test manuel.
