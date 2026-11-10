# Correctifs PC TEST — 10 novembre 2026

Demande de Misu : suspendre Android, corriger les actions Windows et réduire les commandes permanentes. Ne pas promouvoir main/master.

## Changements

- Trackers : suppression effective des onglets automatiques et enregistrés. Une commande SQLite unique archive les tableaux propres à l’onglet, en conservant lignes/coches. Les tableaux partagés restent dans les autres onglets. Protection contre une suppression fondée sur une ancienne révision ; requêtes rejouées sans doublon. Les titres identiques sont distingués par identifiant. Restauration dans Paramètres → Archives → Tableaux archivés.
- Infobulle : survol du fond de la case ou du numéro, focus clavier sur le numéro ; J− futur, J+ passé, J0 aujourd’hui. Position hors de la case et centrée même avec zoom. Masquage au-dessus des rendez-vous, à Échap, au défilement et lors d’un clic.
- Cycle : fond légèrement rouge pour les jours saisis, rouge grisé pour les estimations, en mois et semaine. Petits traits plein/pointillé conservés comme distinction complémentaire. Pas de gros panneau ni de bordure supplémentaire ; lignes horaires préservées, séparateurs simples.
- Calendrier : retrait des commandes permanentes « Aller au » et « Décorer ». Un clic droit sur une date propose rendez-vous, règles, navigation et décoration. Un clic droit sur le titre de la période permet la navigation. Images/couleurs/opacité précédentes conservées.
- Post-it natifs : arrêt de la propagation du clic droit depuis le titre/corps vers la fenêtre. Le menu ne se rouvre plus une seconde fois après une action. Formats Carré, Feuille arrondie et Bandeau ; suppression avec confirmation dans le menu contextuel ou ···.

## Validation et limites

Tests sur SQLite jetable et navigateur réel : suppression annulée/confirmée d’onglets automatiques et groupés, noms identiques, tableaux partagés, F5, restauration des anciennes coches ; repères et vrais fonds du cycle ; navigation et décoration via clic droit ; infobulle à cinq tailles/zooms ; budget, bibliothèque et autres usages conservés.

Tests Windows isolés Python 3.13/3.15 : véritables fenêtres Tk, régions Windows, un menu par clic droit dans le titre/corps ; choix des trois formats via leurs entrées de menu, texte et géométrie retrouvés à la réouverture ; annulation puis confirmation de suppression, disparition de la fenêtre et des données de démonstration.

Build Windows visé : **cf19834e**, séquence **2026111004**. Cette fiche décrit le code ; le passage des tests Windows et la livraison sont à confirmer par le workflow de la branche test/desktop-repairs-20261110. Les résultats exacts de livraison figurent dans le contexte Drive.

Aucun essai sur le véritable PC de Misu : stylet, affichage personnel, sons, notifications et Tailscale restent à constater sur les appareils. Android est en pause (0.1.18) et n’est pas modifié.

Après installation, un compagnon Post-it déjà ouvert peut encore exécuter l’ancien code : utiliser « Quitter les Post-it » près de l’horloge (sauvegarde avant fermeture), puis rouvrir les Post-it depuis L’Atelier. Ne pas terminer brutalement son processus. La fermeture de la seule fenêtre principale ne redémarre pas ce compagnon indépendant.
