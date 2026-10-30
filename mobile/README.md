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
