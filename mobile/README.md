# L’Atelier du Goblin — Android

## Objectif

**Une seule application Android**, mise à jour sans désinstaller l’APK `fr.atelierdugoblin.mobile` déjà utilisée. Son journal, ses habitudes, ses pensées, ses tâches, ses courses et ses rendez-vous historiques sont stockés localement dans la WebView sous la clé `goblin-mobile-prototype-v1`. Ne jamais changer cette clé ni l’origine WebView `https://appassets.androidplatform.net/assets/index.html` sans migration explicite et testée.

## État du développement (branche Android)

- Interface tactile avec thème **Goblin sombre** par défaut et thème **Classique** au choix.
- Barre de navigation basse : calendrier PC connecté, notes JDR, bouton étoile, courses et To-Do.
- Outils étoile : ancrage facultatif, pause, cartes de communication personnelles et journal.
- Anciennes fonctions locales conservées dans le menu.
- Pont natif `TailnetBridge` restreint à des requêtes précises `https://*.ts.net` vers le serveur Windows. Le PC et Tailscale doivent être en fonctionnement ; le pont ne synchronise pas les anciens éléments locaux automatiquement.
- Bouton d’export JSON de l’état Android historique via `ACTION_CREATE_DOCUMENT`. **Ce bouton n’existe pas dans l’ancienne APK déjà installée** ; le premier remplacement doit donc impérativement être signé avec le certificat historique.
- Notes PC sous `/api/mobile/notes` : le stockage partagé est actuellement une liste entière, susceptible de conflits en cas de modifications simultanées ; une résolution des conflits reste à développer.

## Tester sans risquer le téléphone

Le workflow **Android mobile prototype APK** copie `mobile/prototype/index.html` dans les assets, vérifie la syntaxe JavaScript et les identifiants de stockage historiques, construit un APK **DEBUG**, puis démarre l’app sur un émulateur Android. **Un APK DEBUG ne doit pas être installé par-dessus l’APK personnelle signée.**

Le workflow **Android mobile signed release** (manuel, depuis `main`) compile avec la clé permanente. Avant toute publication il vérifie que le certificat SHA-256 de signature correspond exactement à l’APK officiel `android-v0.1.1` déjà publié et que `versionCode` augmente. Si la version historique est indisponible ou si les certificats diffèrent, le processus s’arrête : ne pas contourner ce garde-fou.

### Étapes restantes avant livraison

1. CI Android réellement terminée avec succès et contrôles d’interface sur émulateur.
2. Vérifier que l’APK installée sur le téléphone provient bien de la même signature que l’APK officiel `android-v0.1.1`.
3. Vérifier la stratégie de sauvegarde/récupération des anciennes données locales et les conflits PC↔Android.
4. Tester Android sur appareil réel (barre d’état, navigation, réseau Tailscale, déconnexion/reconnexion, recettes, notes, calendrier).
5. Seulement après validation, publier une version signée et l’installer **en mise à jour**, jamais en supprimant l’application actuelle.

Les changements sur cette branche ne déploient rien dans les installations Windows stable ou Nathan. Ne pas utiliser `tailscale funnel` ni rendre le serveur personnel accessible publiquement.


## Développement 0.1.3 — mobile Goblin, grimoire et #notes

La version 0.1.2 TEST signée a été installée par l’utilisatrice avec ses anciennes données présentes. Toute nouvelle APK doit avoir un versionCode strictement supérieur (0.1.3 = 103), conserver l’applicationId et être signée avec le certificat permanent. **Ne jamais désinstaller la version Android en place.**

- Nom de lanceur Android : **Goblin** ; le titre interne « L’Atelier du Goblin » est cliquable pour rentrer au journal.
- Bouton retour natif : ferme d’abord le menu, annule une édition JDR, ou retourne au journal ; sur l’accueil il minimise l’appli. L’origine WebView et la clé historique sont préservées.
- Navigation système Android : trois boutons masqués par défaut ; un geste peut les révéler temporairement. La barre de statut supérieure reste visible.
- Notes JDR : saisie **locale hors connexion**, recherche, tags libres sous forme #mot, édition, suppression confirmée, copie texte. Si PC connecté, lecture des notes mobiles du PC, possibilité d’envoyer volontairement une copie locale. **Ne prétend pas reproduire la bibliothèque PC complète** : les tags mobiles restent une couche locale simple, les notes envoyées passent via l’API mobile PC dédiée. Éviter les conflits d’écriture.
- Grimoire de recettes : lecture de la route Windows /api/recipes ; filtre par livre (book_name), recherche titre/ingrédients, ingrédients_json, recettes et notes, accès depuis menu, outils étoile et onglet Recettes du PC.
- Minuteurs cuisine : jusqu’à 16 timers locaux, nom libre, heures de fin sauvegardées et recalculées, pause/reprise/arrêt, préréglages 3/5/8/10/15/20 min, saut vers le minuteur depuis une recette, puis retour à la recette après démarrage. Carillon original et annonce vocale facultative « Beast mia miam ! ». **L’alerte sonore est prévue au premier plan ; Android peut suspendre WebView en arrière-plan ou écran verrouillé, ce n’est pas une alarme système garantie.** Pas de son copyrighté intégré.
- Synchronisation Windows : pont HTTPS Tailscale avec requêtes parallèles ; une route indisponible ne doit plus bloquer le chargement des autres rubriques. Les anciennes données du journal ne sont ni effacées ni importées de force.
- Export JSON mobile : inclut maintenant les notes JDR et minuteurs, en plus du journal historique et des préférences.

Tests obligatoires pour livrer 0.1.3 : workflow Android debug vert ; workflow signed 0.1.3 vert avec contrôle du certificat publié 0.1.1 et test d’installation réelle **0.1.2 signée → 0.1.3 signée** sur émulateur. Le parcours réel, les notes et recettes via Tailscale, le bouton retour et le mode immersif doivent ensuite être vérifiés sur l’appareil physique. Ne pas publier avant ces vérifications.
