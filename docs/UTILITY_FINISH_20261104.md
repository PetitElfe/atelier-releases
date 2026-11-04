# Finition utilitaire — état du travail au 4 novembre 2026

La liste comprend 321 points utilitaires et 9 options explicitement hors version. Les cases originales ci-dessous restent ouvertes : aucune validation sur les appareils de Léo n’a été effectuée depuis cet environnement. Une fonction présente ou un scénario automatique réussi ne vaut pas une validation complète du point.

## Modifications de ce lot TEST personnel

- Sauvegarde complète SQLite, fichiers DATA, pièces jointes, dessins, notes privées, préférences et brouillons du navigateur. Export JSON indépendant, contrôle des empreintes, aperçu avant import, confirmation puis restauration avec redémarrage et copie de secours.
- Copies au démarrage : douze récentes et une par jour sur trente jours ; copie initiale permanente. Copie SQLite avant migration, maintenant fermée avant le renommage Windows. Diagnostic sans contenu des notes et redémarrage depuis les paramètres.
- Protection contre une copie corrompue, un chemin interdit, une autre édition ou une base plus récente. Import d’un autre profil seulement vers une installation vide et après demande explicite. Une restauration interrompue récupère la copie précédente ; une copie préparée devenue invalide est annulée.
- Synchronisation : reçu durable par opération et comparaison des champs d’origine. Une réponse perdue peut être rejouée sans double création ; une modification concurrente incompatible est refusée. Android garde une file locale et propose de revoir les conflits. Actualisation en arrière-plan de l’interface et au retour sur la page.
- Notes PC partagées : catégories et hashtags multiples sur le même identifiant, recherche, liens vers tâches/objectifs/autres notes, archives récupérables, brouillons et copie locale en cas de conflit. Envoi mobile volontaire. Les anciens clients peuvent lire mais doivent être mis à jour avant de modifier une note existante.
- Santé mentale : historique privé avant révision et copie initiale ; fichier illisible jamais remplacé par une collection vide. Brouillons Windows conservés après rechargement ou échec réseau, export et récupération d’une écriture non envoyée. Brouillons Android par contexte d’édition.
- Windows : notifications natives facultatives via le compagnon, boutons Terminer / 10 min / 30 min / 1 heure / Annuler. Activation liée à un jeton à usage unique et à l’échéance actuelle. Les rappels déjà envoyés ne bloquent plus les suivants. Refus pendant mise à jour/restauration. Les rappels natifs ne complètent jamais une série entière.
- Cuisine Windows : minuteurs nommés indépendants, pause/reprise/arrêt, rappels persistants côté serveur, reprise sans doublon si la confirmation de démarrage est perdue. Intégration avec le compagnon de notification.
- Cuisine Android : AlarmManager pour les minuteurs nommés, autorisations demandées explicitement, reprise après redémarrage/mise à jour, prévention des doublons, notification native et véritable son importé. Aucune nouvelle image ni voix générée. Les sons restent soumis au réglage et aux restrictions du téléphone.
- Mises à jour Android : même identifiant, même certificat, versionCode 112 vers 113. Export complet enrichi du son de cuisine importé ; sauvegarde privée du premier son. Aucun appareil réel modifié.
- Windows : refus d’une livraison dont le numéro est inférieur à celui installé. Correction du focus des formulaires qui pouvait repartir vers le premier champ.

Les bibliothèques de carnets, moodboards par domaine, cartes d’objectifs, recettes en livres, décors du calendrier et dessins personnels des livraisons précédentes sont conservés.

## Couverture automatique et ses limites

| Domaine | Preuves à consulter dans le dépôt | Portée |
| --- | --- | --- |
| Données et récupération | tests/test_utility_safety.py ; tools/utility_safety_browser_test.cjs | Copie, import contrôlé, reprise après interruption, véritable redémarrage serveur, réglages et brouillons |
| Conflits et doublons | tests/test_utility_sync.py ; tools/utility_android_sync_browser_test.cjs sur la branche Android | Réponse perdue, coupure réseau, rejeu, conflit et API PC réelle |
| Notes | tests/test_utility_notes.py ; test navigateur utilitaire | Hashtags, tombstones, corruption, brouillon et sauvegarde après coupure |
| Windows | tests/test_windows_delivery_install.py ; job windows | Véritable installation dans un E: jetable, conservation des données et du profil, autres canaux intacts, manifeste et anti-retour |
| Accueil et tâches | home_reference, home_upcoming_overlay, life_tools, preparations_tracker_home | Disposition, interactions, conservation et préparation des rendez-vous |
| Calendrier et cycles | calendar_priority, week_clarity_forecast, cycle_compact, windows_library_calendar | Vues, contrastes, cycles et décorations |
| Trackers | tracker_ritual ; tests/test_tracker_* | Sous-listes, nombres, périodes, archives et positions |
| Bibliothèque et progression | library, domain_moodboard, objective_map ; tests/test_objective_* | Édition, conservation, gestes annulés, liens et règles de progression |
| Cuisine | recipe_shelves ; test navigateur utilitaire | Tranches, rayons, portions, courses, archives, minuteurs indépendants |
| Personnalisation | personal_design ; windows_library_calendar | Import de véritables fichiers, aperçu, export, conservation et paramètres du calendrier |
| Android natif | tools/utility_android_emulator_test.py sur la branche Android | Mise à jour signée et alarmes écran éteint, à consulter seulement si le job est vert |

Les commandes désignent les fichiers tools/*_browser_test.cjs. Le résultat exact, la révision et les journaux Actions font foi ; un fichier de test seul n’est pas une preuve de réussite.

## Reste ouvert avant de pouvoir annoncer « version utilitaire terminée »

1. Recette sur le vrai PC et le vrai téléphone, remplacement sans désinstallation, Play Protect, raccourcis/zone de notification, réglages des sons, notifications écran verrouillé et pendant un jeu. Aucune case correspondante validée ici.
2. Vérification Tailscale réel, PC éteint, reprise réseau réelle et comparaison des anciens carnets. Les simulations automatiques ne prouvent pas la configuration du réseau personnel.
3. Rappels Android généraux (rendez-vous/tâches/échéances) en arrière-plan : les alarmes natives de ce lot concernent la cuisine. Le suivi complet des rappels récurrents Windows et leurs occurrences reste à terminer ; ne pas l’annoncer terminé.
4. Audit fonctionnel point par point des modules P1 : deadlines enrichies, liens projets/documents, annotations/corrections et réorganisation de certaines vues. Les fonctions déjà présentes et leurs tests ne suffisent pas à fermer chaque demande précise de la liste.
5. Thèmes nommés multiples et restrictions individuelles du mode créatrice à renforcer si plusieurs personnes utilisent la même session Windows. Le contrôle actuel est celui de l’installation personnelle TEST, sans authentification propre à une personne. Pas de chiffrement applicatif ajouté aux notes de santé ; leur confidentialité dépend des accès au PC, à la session, aux sauvegardes et au réseau privé.
6. Livraison stable : aucune promotion vers main ni vers le canal de Nathan. Rester en TEST jusqu’à la recette réelle et l’accord explicite.

## Liste originale conservée pour la recette

# L’ATELIER DU GOBLIN — CHECKLIST DE FINITION UTILITAIRE
**Windows + Android — 3 novembre 2026**

**Objectif :** obtenir une application quotidienne complète, stable, simple à utiliser, dont toutes les données sont conservées et synchronisées correctement.

**Règle de validation :** une fonction codée ou testée automatiquement n’est pas forcément terminée. Elle doit aussi fonctionner sur le vrai PC ou téléphone.

**Priorités :**
- **P0 : indispensable** pour livrer une version utilisable sans risque.
- **P1 : à finaliser** pour que chaque domaine utilitaire soit complet.
- **P2 : personnalisation** à intégrer sans retarder le fonctionnement.
- **Hors périmètre :** JDR et extensions facultatives.

---

# PHASE 1 — RENDRE L’APPLICATION FIABLE (P0)

## 1. Sécurité, sauvegardes et conservation des données

- [ ] Vérifier que toutes les anciennes données Windows sont conservées après une mise à jour.
- [ ] Vérifier que toutes les anciennes données Android sont conservées après une mise à jour.
- [ ] Valider la sauvegarde automatique avant chaque mise à jour.
- [ ] Valider la sauvegarde automatique au démarrage et sa conservation dans le temps.
- [ ] Permettre une sauvegarde externe indépendante de l’application.
- [ ] Permettre l’exportation complète des données en JSON.
- [ ] Vérifier l’importation et la restauration d’une sauvegarde.
- [ ] Préserver une copie initiale des données avant migration.
- [ ] Empêcher les mises à jour risquant d’écraser des données non sauvegardées.
- [ ] Tester les migrations entre anciennes et nouvelles versions.
- [ ] Prévoir une récupération des données après une mise à jour défectueuse.
- [ ] Ajouter un historique d’erreurs et un diagnostic facilement consultable.
- [ ] Protéger les données sensibles, notamment les carnets de santé mentale.
- [ ] Vérifier que les données de Nathan et Léo restent séparées.

## 2. Installation et mises à jour Windows

- [ ] Vérifier l’installation complète de L’Atelier Windows TEST.
- [ ] Vérifier le raccourci Bureau et l’icône de l’application.
- [ ] Vérifier le démarrage sans manipulation de fichiers ni de code.
- [ ] Intégrer une recherche de mises à jour directement dans les paramètres.
- [ ] Télécharger les mises à jour Windows depuis l’application.
- [ ] Afficher clairement l’avancement du téléchargement et de l’installation.
- [ ] Sauvegarder les données avant le remplacement des fichiers.
- [ ] Fermer proprement l’application pour installer une mise à jour.
- [ ] Relancer automatiquement la véritable fenêtre après l’installation.
- [ ] Éviter les processus Python ou serveurs laissés ouverts.
- [ ] Ajouter un bouton « Redémarrer l’application ».
- [ ] Vérifier le fonctionnement de l’icône dans la zone de notification Windows.
- [ ] Vérifier le manifeste et les empreintes SHA-256.
- [ ] Confirmer que l’application fonctionne après fermeture et réouverture.

## 3. Installation et mises à jour Android

- [ ] Installer et valider la version 0.1.12 TEST sur le vrai téléphone.
- [ ] Vérifier que l’installation remplace l’ancienne version sans désinstallation.
- [ ] Vérifier que tous les carnets, notes et paramètres sont conservés.
- [ ] Vérifier la création de la première sauvegarde automatique.
- [ ] Vérifier le bouton « Chercher une nouvelle version TEST en 1 clic ».
- [ ] Conserver les deux canaux : versions stables et versions TEST.
- [ ] Afficher clairement la version installée et la version disponible.
- [ ] Afficher les erreurs de téléchargement avec une explication compréhensible.
- [ ] Vérifier le téléchargement et l’installation directement depuis Goblin.
- [ ] Afficher l’avancement du téléchargement.
- [ ] Confirmer les signatures et empreintes des APK.
- [ ] Conserver la confirmation Android avant installation.
- [ ] Vérifier le comportement après une mise à jour.
- [ ] Tester la récupération après un téléchargement interrompu.
- [ ] Vérifier Play Protect et les autorisations d’installation.
- [ ] Confirmer qu’aucune manipulation des données n’est nécessaire à chaque mise à jour.

## 4. Synchronisation Windows ↔ Android

- [ ] Vérifier la connexion réelle via Tailscale.
- [ ] Synchroniser les tâches dans les deux sens.
- [ ] Synchroniser les tâches cochées, modifiées et supprimées.
- [ ] Synchroniser les rendez-vous du calendrier dans les deux sens.
- [ ] Synchroniser les courses et les quantités dans les deux sens.
- [ ] Synchroniser les recettes et leurs modifications.
- [ ] Synchroniser volontairement les notes entre PC et téléphone.
- [ ] Conserver les catégories et hashtags pendant la synchronisation des notes.
- [ ] Synchroniser le carnet de santé mentale sans effacer les écritures récentes.
- [ ] Actualiser automatiquement les données sans appuyer sur F5.
- [ ] Actualiser les données au retour dans l’application mobile.
- [ ] Afficher l’état de connexion, la dernière synchronisation réussie et les erreurs.
- [ ] Gérer proprement les modifications faites simultanément sur deux appareils.
- [ ] Prévoir les modifications hors ligne et leur synchronisation ultérieure.
- [ ] Éviter les doublons après reconnexion.
- [ ] Vérifier le comportement quand le PC est éteint.
- [ ] Vérifier le comportement quand Tailscale est déconnecté.
- [ ] Garantir qu’une perte de connexion ne supprime jamais les données locales.

## 5. Notifications et rappels

- [ ] Vérifier les rappels Windows liés aux rendez-vous, tâches et échéances.
- [ ] Afficher de vraies notifications Windows lorsque l’application est réduite.
- [ ] Conserver les rappels actifs sans dépendre d’un navigateur ouvert.
- [ ] Permettre de terminer, reporter ou annuler depuis une notification.
- [ ] Ajouter les reports rapides de 10 minutes, 30 minutes et 1 heure.
- [ ] Gérer correctement les rappels multiples et récurrents.
- [ ] Vérifier les notifications écran verrouillé.
- [ ] Vérifier les notifications pendant l’utilisation d’un jeu.
- [ ] Vérifier les différents sons personnalisés.
- [ ] Corriger le volume si les sons sont trop faibles.
- [ ] Tester les notifications Android natives.
- [ ] Déclencher les rappels Android même lorsque Goblin n’est pas au premier plan, dans les limites du système.
- [ ] Éviter les notifications en double.
- [ ] Empêcher la disparition silencieuse d’un rappel important.
- [ ] Organiser logiquement les paramètres des sons, rappels et autorisations.

## 6. Navigation et boutons

- [ ] Tester tous les boutons de chaque rubrique Windows.
- [ ] Tester tous les boutons de chaque rubrique Android.
- [ ] Vérifier qu’aucun bouton n’est inactif.
- [ ] Vérifier les menus de navigation et le bouton Accueil.
- [ ] Vérifier le bouton Retour Android.
- [ ] Corriger les appuis longs provoquant des sélections ou petits carrés bleus.
- [ ] Empêcher les ouvertures involontaires de menus.
- [ ] Agrandir ou espacer les commandes trop difficiles à toucher.
- [ ] Supprimer les anciens boutons de navigation devenus inutiles.
- [ ] Retirer partout l’ancienne flèche du tiroir devenue obsolète.
- [ ] Vérifier l’interface sur petit écran et avec une police agrandie.
- [ ] Tester le mode sombre et le mode clair sans perte de données.

---

# PHASE 2 — TERMINER LES DOMAINES UTILITAIRES (P1)

## 7. Accueil Windows

- [ ] Vérifier l’affichage complet de l’Accueil.
- [ ] Vérifier la date en haut, centrée correctement.
- [ ] Garder le mini-calendrier et les rendez-vous à venir lisibles.
- [ ] Faire passer « Voir les 6 rendez-vous à venir » devant les autres modules.
- [ ] Garder la To-Do list et les habitudes côte à côte.
- [ ] Vérifier le défilement indépendant des carnets et modules.
- [ ] Conserver un seul bouton global « Modifier ».
- [ ] Déplacer librement les modules à la souris.
- [ ] Redimensionner correctement chaque module.
- [ ] Sauvegarder les positions et dimensions après fermeture.
- [ ] Corriger les chevauchements et problèmes de résolution d’écran.
- [ ] Vérifier le menu au clic droit sur les modules.
- [ ] Permettre de créer, fermer, verrouiller, archiver et restaurer les Post-it.
- [ ] Permettre de supprimer définitivement un Post-it avec confirmation.
- [ ] Rendre les suggestions d’objectifs utiles, réorganisables et facultatives.

## 8. Calendrier Windows

- [ ] Vérifier définitivement les vues mois, semaine et année.
- [ ] Corriger les derniers débordements et superpositions de la vue hebdomadaire.
- [ ] Afficher clairement les 24 heures avec des lignes horaires.
- [ ] Rendre le texte des rendez-vous lisible en thème sombre.
- [ ] Afficher les événements « Toute la journée » au bon emplacement.
- [ ] Gérer les rendez-vous simultanés en colonnes lisibles.
- [ ] Vérifier la création d’un rendez-vous.
- [ ] Vérifier la modification et la sauvegarde d’un rendez-vous.
- [ ] Vérifier la suppression d’un rendez-vous.
- [ ] Vérifier les rendez-vous récurrents.
- [ ] Gérer correctement la modification d’une occurrence ou d’une série entière.
- [ ] Conserver les URL cliquables dans les rendez-vous.
- [ ] Relier la préparation et les sous-tâches aux événements.
- [ ] Corriger les infobulles J-N / M-N qui passent derrière les cases.
- [ ] Vérifier le positionnement des numéros dans la vue annuelle.
- [ ] Garder les couleurs thématiques des rendez-vous suffisamment visibles.
- [ ] Remplacer les formes peu esthétiques autour du jour actuel.
- [ ] Permettre de saisir une date pour l’ouvrir directement.
- [ ] Conserver l’historique des événements faits, reportés ou annulés.
- [ ] Corriger les bugs de prévisions liées aux cycles.
- [ ] Corriger les cases des règles affichées à moitié ou tronquées.
- [ ] Centrer correctement l’indicateur J-3.
- [ ] Regrouper « Goblin grognon », les règles et l’indicateur J-3 dans un seul affichage cohérent.

## 9. Tâches, échéances et capture rapide

- [ ] Vérifier la création, modification, suppression et validation des tâches.
- [ ] Conserver les tâches terminées jusqu’au lendemain puis dans l’historique.
- [ ] Garder les tâches prioritaires en haut.
- [ ] Permettre de réorganiser manuellement les tâches.
- [ ] Vérifier l’archivage et la restauration.
- [ ] Relier les sous-tâches préparatoires aux rendez-vous.
- [ ] Finaliser le système des deadlines.
- [ ] Afficher les échéances à venir, aujourd’hui et en retard.
- [ ] Ajouter priorités, liens, documents et sous-tâches aux échéances.
- [ ] Relier les deadlines au calendrier et aux notifications.
- [ ] Vérifier le système de capture rapide.
- [ ] Envoyer automatiquement une capture dans le bon domaine grâce aux hashtags.
- [ ] Éviter une boîte de réception supplémentaire inutile.
- [ ] Vérifier la conservation des longs textes saisis rapidement.

## 10. Habitudes, trackers et cycles

- [ ] Vérifier les tableaux de suivi indépendants.
- [ ] Vérifier leurs couleurs et leurs calendriers.
- [ ] Terminer les sous-checklists liées aux habitudes.
- [ ] Vérifier les compteurs numériques.
- [ ] Corriger les problèmes de déplacement des tableaux.
- [ ] Permettre un placement 2D plus libre si nécessaire.
- [ ] Vérifier l’archivage et la restauration des trackers.
- [ ] Vérifier les cases après actualisation et changement de mois.
- [ ] Naviguer facilement par semaine.
- [ ] Simplifier les boutons d’ajout et de modification.
- [ ] Vérifier le suivi des cycles et ses estimations.
- [ ] Tester les prévisions aux changements de mois.
- [ ] Vérifier la rotation des séances sportives A → B → C.

## 11. Bibliothèques, domaines et carnets

- [ ] Vérifier les bibliothèques principales et les bibliothèques particulières.
- [ ] Organiser clairement les domaines, sous-domaines, carnets et livres.
- [ ] Créer un véritable accueil visuel pour chaque domaine.
- [ ] Prévoir un moodboard propre à chaque domaine.
- [ ] Afficher les livres sous forme de bibliothèque lorsqu’un domaine s’y prête.
- [ ] Ouvrir l’éditeur lorsque l’on sélectionne un livre.
- [ ] Permettre à l’éditeur d’occuper l’espace disponible.
- [ ] Vérifier l’éditeur de texte et ses mises en forme.
- [ ] Conserver les textes, tableaux, images et liens après fermeture.
- [ ] Ouvrir un carnet à la dernière page consultée.
- [ ] Ajouter sommaire, pagination et navigation entre les pages.
- [ ] Vérifier la recherche dans les carnets.
- [ ] Créer des liens entre différentes fiches.
- [ ] Permettre à une note d’appartenir à plusieurs domaines sans duplication.
- [ ] Lier une note à une tâche, un projet ou un objectif.
- [ ] Prévoir des annotations et corrections sur les textes.
- [ ] Corriger les incohérences de rangement des notes.
- [ ] Terminer le système général de classement par hashtags.
- [ ] Vérifier que les anciennes notes restent accessibles après migration.

## 12. Objectifs et carte de progression

- [ ] Vérifier le zoom et le déplacement sur la carte.
- [ ] Vérifier la création d’objectifs et de leurs étapes.
- [ ] Vérifier les connexions entre les étapes.
- [ ] Empêcher les liaisons impossibles.
- [ ] Conserver les étapes obligatoires et facultatives.
- [ ] Sauvegarder correctement la carte.
- [ ] Finaliser les règles de progression et d’XP.
- [ ] Relier tâches, documents et carnets aux objectifs.
- [ ] Permettre de réorganiser les objectifs prioritaires.
- [ ] Prévoir la reprise d’un objectif après une longue période d’inactivité.

## 13. Recettes, cuisine, courses et repas

- [ ] Finaliser la bibliothèque des recettes.
- [ ] Afficher les recettes comme des livres rangés dans une bibliothèque.
- [ ] Afficher les noms des recettes sur les tranches des livres.
- [ ] Ouvrir une fiche recette en sélectionnant un livre.
- [ ] Vérifier l’édition et la sauvegarde des recettes.
- [ ] Relier les ingrédients aux listes de courses.
- [ ] Vérifier les quantités et unités.
- [ ] Éviter les articles en double dans les courses.
- [ ] Vérifier les stocks et dates limites.
- [ ] Vérifier la planification des repas et menus.
- [ ] Prévoir plusieurs minuteurs de cuisine indépendants.
- [ ] Pouvoir nommer les minuteurs.
- [ ] Vérifier les sons et alarmes des minuteurs.
- [ ] Faire fonctionner les minuteurs Android écran verrouillé.
- [ ] Synchroniser correctement courses et recettes entre Windows et Android.

## 14. Budget et dépenses

- [ ] Vérifier la saisie rapide des dépenses.
- [ ] Vérifier le classement par catégorie.
- [ ] Finaliser les trois modes d’affichage du « reste ».
- [ ] Afficher correctement « Il manque » selon le mode sélectionné.
- [ ] Gérer les revenus, dépenses et opérations récurrentes.
- [ ] Ajouter les budgets mensuels par catégorie.
- [ ] Permettre la correction d’une erreur sans créer de doublon.
- [ ] Vérifier les archives et historiques.
- [ ] Afficher des bilans simples et lisibles.
- [ ] Relier une dépense à un justificatif si nécessaire.

## 15. Administratif et documents

- [ ] Réorganiser l’interface Administratif pour la rendre compréhensible.
- [ ] Créer des démarches avec un statut clair.
- [ ] Afficher la prochaine action à effectuer.
- [ ] Suivre les documents nécessaires et manquants.
- [ ] Permettre de joindre des documents à une démarche.
- [ ] Enregistrer organismes, contacts et destinataires.
- [ ] Relier les échéances administratives aux rappels et au calendrier.
- [ ] Séparer documents vierges et documents complétés.
- [ ] Ajouter recherche, filtres et archives.
- [ ] Prévoir un classement documentaire cohérent.
- [ ] Permettre de renommer et ranger les documents avec confirmation.
- [ ] Suivre les documents envoyés, en attente, valides ou expirés.
- [ ] Préserver les fichiers originaux avant déplacement ou renommage.

## 16. Journal, émotions et santé

- [ ] Vérifier le journal personnel Windows.
- [ ] Vérifier la création et la modification des entrées.
- [ ] Vérifier les suivis d’émotions et leur historique.
- [ ] Vérifier le suivi des rendez-vous de santé.
- [ ] Vérifier le suivi d’activité physique.
- [ ] Garder le carnet de santé mentale distinct du journal ordinaire.
- [ ] Vérifier son édition et sa sauvegarde sur Windows.
- [ ] Vérifier son édition et sa sauvegarde sur Android.
- [ ] Tester la synchronisation volontaire entre les deux appareils.
- [ ] Vérifier l’historique des modifications et suppressions.
- [ ] Vérifier la confidentialité et les sauvegardes de ces informations.

## 17. Goblin Android — Fonctions quotidiennes

- [ ] Vérifier le calendrier mobile et ses différentes vues.
- [ ] Afficher les vrais rendez-vous du PC.
- [ ] Permettre de créer et modifier des rendez-vous depuis le téléphone.
- [ ] Vérifier les tâches et leurs actions.
- [ ] Vérifier les courses et leurs actions.
- [ ] Vérifier l’accès aux recettes synchronisées.
- [ ] Vérifier les notes générales et leurs hashtags.
- [ ] Vérifier l’accès aux catégories de notes du PC.
- [ ] Vérifier les cartes et le journal rapide.
- [ ] Vérifier le geste de l’étoile vers la respiration.
- [ ] Vérifier l’animation du cercle respiratoire.
- [ ] Vérifier le son doux et son réglage.
- [ ] Vérifier les phrases réconfortantes aléatoires.
- [ ] Vérifier les exercices sous forme de cartes avec zone d’écriture.
- [ ] Vérifier les sections crises d’angoisse, tristesse, pensées catastrophiques, petites histoires et moments pour soi.
- [ ] Conserver les réponses et histoires après fermeture.
- [ ] Vérifier les minuteurs de cuisine sur téléphone.
- [ ] Tester les fonctions hors connexion.
- [ ] Vérifier le retour à l’accueil depuis toutes les pages.

---

# PHASE 3 — PERSONNALISATION ET FINITIONS (P2)

## 18. Mode créatrice et personnalisation graphique

- [ ] Ajouter un mode de personnalisation accessible uniquement à Léo.
- [ ] Permettre d’importer ses propres dessins PNG réalisés dans Clip Studio Paint.
- [ ] Permettre de changer les images des boutons.
- [ ] Permettre de changer les icônes des domaines.
- [ ] Permettre de personnaliser les fonds des pages et modules.
- [ ] Permettre de placer certains éléments graphiques par glisser-déposer.
- [ ] Afficher les dimensions recommandées des images.
- [ ] Indiquer le format, la transparence et les proportions attendues pour chaque emplacement.
- [ ] Prévisualiser les modifications avant de les appliquer.
- [ ] Sauvegarder plusieurs thèmes personnalisés.
- [ ] Pouvoir revenir au thème par défaut.
- [ ] Préserver la lisibilité et les zones cliquables, même avec un thème personnalisé.
- [ ] Ne pas imposer d’images générées par IA.

## 19. Personnalisation du calendrier

- [ ] Ajouter des images décoratives dans les cases des jours.
- [ ] Permettre de régler la transparence de ces images.
- [ ] Permettre de personnaliser la couleur du numéro du jour.
- [ ] Ajouter un curseur pour régler cette personnalisation.
- [ ] Vérifier les contrastes entre les décorations et les rendez-vous.
- [ ] Conserver les décorations après sauvegarde et mise à jour.
- [ ] Vérifier que les images ne masquent pas les événements.

## 20. Cohérence générale de l’interface

- [ ] Harmoniser les icônes dans toute l’application.
- [ ] Éviter le mélange entre emojis et icônes.
- [ ] Harmoniser la taille des textes, boutons et champs.
- [ ] Organiser les paramètres comme ceux d’un téléphone.
- [ ] Réduire les encadrés et titres redondants.
- [ ] Utiliser des couleurs cohérentes par domaine.
- [ ] Rendre les états survolés et sélectionnés compréhensibles.
- [ ] Corriger les dernières superpositions et éléments coupés.
- [ ] Vérifier l’accessibilité du clavier, de la souris et du tactile.
- [ ] Supprimer les anciennes rubriques une fois leurs remplaçantes validées.
- [ ] Garder une interface rapide et lisible même avec beaucoup de données.

---

# PHASE 4 — TESTS DE LIVRAISON FINALE

## 21. Recette complète Windows

- [ ] Installer la dernière version TEST sur un vrai PC.
- [ ] Vérifier le démarrage et la fermeture.
- [ ] Tester les principales fonctions de chaque domaine.
- [ ] Créer, modifier, supprimer et retrouver des données de démonstration.
- [ ] Vérifier les sauvegardes et restaurations.
- [ ] Vérifier le mode sombre.
- [ ] Vérifier la disposition des modules après redémarrage.
- [ ] Tester les notifications et rappels.
- [ ] Tester une mise à jour complète depuis l’application.
- [ ] Vérifier qu’aucun module ne bloque les autres.

## 22. Recette complète Android

- [ ] Installer la dernière version signée sans désinstaller la précédente.
- [ ] Vérifier les données déjà présentes.
- [ ] Vérifier la sauvegarde initiale.
- [ ] Tester tous les boutons et menus.
- [ ] Tester l’étoile et la respiration.
- [ ] Tester la création de notes et le classement par hashtags.
- [ ] Tester le carnet de santé mentale.
- [ ] Tester le calendrier, les tâches et les courses.
- [ ] Tester les minuteurs et les notifications.
- [ ] Tester les fonctions hors ligne.
- [ ] Tester une nouvelle mise à jour depuis les paramètres.

## 23. Recette complète de synchronisation

- [ ] Créer une tâche sur Windows et la retrouver sur Android.
- [ ] Modifier cette tâche sur Android et vérifier Windows.
- [ ] Créer un rendez-vous sur Android et le retrouver sur Windows.
- [ ] Modifier une liste de courses sur les deux appareils.
- [ ] Synchroniser une note contenant plusieurs hashtags.
- [ ] Synchroniser une entrée de carnet avec autorisation.
- [ ] Tester la perte de connexion pendant une modification.
- [ ] Tester une reconnexion sans doublons.
- [ ] Vérifier qu’aucun ancien texte n’a disparu.

## 24. Validation de la livraison

- [ ] Corriger tous les bugs bloquants identifiés.
- [ ] Terminer les fonctionnalités utilitaires promises.
- [ ] Vérifier les sauvegardes indépendantes de Nathan et Léo.
- [ ] Conserver les fonctions JDR isolées des versions qui n’en ont pas besoin.
- [ ] Mettre la documentation et la checklist Drive en cohérence avec les résultats.
- [ ] Préparer une version Windows stable.
- [ ] Préparer une version Android stable et signée.
- [ ] Publier seulement après validation et accord.
- [ ] Conserver une procédure simple de restauration et de dépannage.

---

# HORS VERSION UTILITAIRE — À FAIRE PLUS TARD

Ces éléments ne doivent pas empêcher de terminer la version quotidienne de L’Atelier :

- [ ] Finaliser le module JDR complet et ses cartes.
- [ ] Ajouter un Pomodoro transversal.
- [ ] Développer les collections et récompenses décoratives.
- [ ] Développer les fiches de révision avancées.
- [ ] Ajouter davantage de statistiques et de bilans.
- [ ] Ajouter une décoration saisonnière ou météo.
- [ ] Prévoir une synchronisation sans PC allumé, via NAS ou serveur.
- [ ] Ajouter les intégrations facultatives avec des calendriers externes.
- [ ] Développer les fonctions de coaching, apprentissage et outils spécialisés.

---

# DÉFINITION DE « VERSION UTILITAIRE TERMINÉE »

L’Atelier pourra être considéré comme terminé pour son usage quotidien lorsque :

1. Les modules indispensables fonctionnent sur Windows.
2. Goblin fonctionne correctement sur Android.
3. La synchronisation PC/téléphone est fiable.
4. Les données sont sauvegardées, récupérables et protégées.
5. Les notifications et rappels fonctionnent.
6. Les mises à jour s’effectuent facilement depuis les applications, avec les confirmations nécessaires.
7. Les utilisateurs peuvent créer, modifier, retrouver et supprimer leurs données sans bugs bloquants.
8. L’interface est cohérente, lisible et utilisable sans connaissances techniques.
9. Les tests réels sont validés.
10. Les fonctionnalités facultatives peuvent être développées ensuite sans empêcher l’utilisation quotidienne.

**Priorité absolue : terminer d’abord la phase 1 et les modules quotidiens de la phase 2, puis effectuer la phase 4. La personnalisation avancée peut suivre sans bloquer la première version utilitaire stable.**