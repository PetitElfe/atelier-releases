# Suivi PC TEST — calendrier et Post-it — 10 novembre 2026

Cette demande remplace les choix visuels du correctif cf19834e. Android reste en pause. Distribution personnelle TEST uniquement ; main et les données réelles ne sont pas modifiés.

Build prévu : cd52f187, séquence 2026111005. Le contexte Drive consigne le commit immuable et le résultat de la CI avant livraison.

## Calendrier

- Infobulle J dans la case concernée, centrée en bas et non au-dessus ; emplacement réservé pour conserver la lisibilité des rendez-vous. Survol du fond/numéro et focus clavier ; masquage sur les actions, Échap, défilement et clic.
- Même couleur rouge pour jours enregistrés et prévisions ; opacité plus faible pour les prévisions. Plus de rouge grisé. Aucun trait, point ou bande du cycle ; description accessible conservée.
- « Goblin grognon · J−N » sans « avant les règles estimées ».
- La classe générique cycle-forecast imposait line-height:1.5 ; les cases ordinaires et prévisionnelles utilisent désormais les mêmes hauteurs de ligne pour les rendez-vous. Comparaison réelle de hauteur, police, padding et bordure sur les deux fonds.

## Post-it natifs

- Le bouton du haut crée une seule nouvelle note. « Afficher tous » reste une action séparée dans les paramètres ou le compagnon. Une ouverture ciblée ne réaffiche pas les cinq anciennes notes ; le démarrage du service de rappels reste discret.
- Verrouillage des actions concurrentes dans l’interface et identifiant de création persisté dans SQLite pour qu’une nouvelle tentative de la même requête ne crée pas un doublon.
- Croix × visible sur la note et croix de la fenêtre système : suppression définitive avec confirmation. Annulation conserve la note. « Enregistrer et fermer » reste une commande distincte de conservation ; Alt+F4 enregistre et ferme.
- Le menu au clic droit et les trois formats sont conservés. La suppression retire note et géométrie, ferme la fenêtre et ne la réaffiche pas au prochain réveil.
- Un ancien compagnon déjà ouvert peut exécuter l’ancien code malgré une mise à jour du serveur. Il est détecté : indication claire dans Paramètres et refus de créer une note supplémentaire. Une fermeture manuelle via l’icône près de l’horloge → Quitter les Post-it reste nécessaire une fois pour passer de l’ancien compagnon à celui-ci. Pas de terminaison forcée du processus.
- Le nouveau compagnon vérifie son code après les mises à jour suivantes : sauvegarde les textes en cours, quitte proprement et recharge uniquement les notes déjà visibles. Pas de réouverture globale des notes masquées.

## Vérifications

Les essais locaux utilisent une vraie API/SQLite jetable et Chromium : infobulle dans la case à cinq tailles/zooms, absence de repères du cycle, rouge plus léger, libellé court, mêmes dimensions de rendez-vous, menu et données conservés, clic répété et concurrence des commandes Post-it.

Le scénario natif Windows (Python 3.13/3.15) exécute le vrai cycle GUI sur un profil jetable : cinq notes enregistrées, ouverture d’une seule, suppression via la vraie croix, création d’une seule nouvelle note, réveils répétés sans fenêtres supplémentaires, puis modification du fichier de code avec du texte non enregistré pour vérifier la sauvegarde et le rechargement ciblé. Aucun test ne supprime les notes réelles de Misu.

La CI et les essais natifs doivent passer avant la livraison TEST. Le rendu et l’installation sur son PC restent à constater par Misu ; aucun accès à son ordinateur n’a été effectué depuis cette session.
