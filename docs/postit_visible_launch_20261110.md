# Post-it : clic sans effet visible — 10 novembre 2026

Windows TEST uniquement, Android en pause. Cette correction complète 3cbae57d, conserve le calendrier et les notes existantes. Build candidat 43d8c201, séquence 2026111006. Les résultats exacts de livraison sont dans le contexte Drive.

Le code précédent annonçait une réussite dès Popen, sans vérifier le démarrage du GUI. Une fenêtre pouvait aussi rester derrière la WebView. Aucune cause précise sur le PC de Misu ne peut être affirmée sans le message de son installation.

Le lancement attend désormais la confirmation écrite par le vrai GUI après mappage de la note : empreinte du code chargé, état prêt, note visible et acquittement de la demande de réveil. Le délai est borné à huit secondes. Si le processus se termine, l’erreur de son journal local remonte ; sinon l’absence de confirmation est signalée au lieu d’un faux succès.

La note demandée est remontée à l’ouverture et lors d’un réveil ; son état temporaire au-dessus est retiré après 220 ms. Pas de fenêtre toujours au-dessus. Le compteur des paramètres distingue un compagnon démarré d’une fenêtre réellement visible.

Une erreur reste dans une boîte de dialogue lisible et fermable, pas uniquement dans une notification éphémère ou une rubrique masquée. L’identifiant de la demande est conservé localement jusqu’à confirmation ; une nouvelle tentative, y compris après rechargement, reprend la même note via le reçu SQLite et ne crée pas de doublon.

Tests : vraie interface avec erreur de lancement simulée, dialogue visible, rechargement et nouvelle tentative portant le même identifiant ; unités sur confirmation, note absente, arrêt du processus et message remonté. Sous Windows, nouveau test du véritable pythonw et du vrai script de compagnon dans un profil temporaire entièrement séparé : cinq notes enregistrées, une seule fenêtre visible, même processus réutilisé, absence de toujours-au-dessus permanent, puis processus volontairement défaillant et erreur retournée. Aucun accès aux notes de Misu ; seules les fenêtres et processus jetables du test sont nettoyés.

Les essais précédents sur la croix, formes, réveil ciblé, conservation du texte et rechargement restent exigés avec Python 3.13 et 3.15, ainsi que l’installation et la restauration isolées. Aucun résultat utilisateur n’est coché automatiquement.
