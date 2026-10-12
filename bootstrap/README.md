# Lanceur / updater — socle 0.6

Ces fichiers correspondent au lanceur audité et renforcé :
- le lanceur principal ne démarre plus L’Atelier si la mise à jour échoue ;
- le code retour du .bat de mise à jour est récupéré correctement ;
- le manifeste est demandé sans cache ;
- chaque fichier téléchargé garde sa vérification SHA-256 ;
- la nouvelle application est compilée et démarrée dans un dossier de test avant d’être installée ;
- le vieux mode ZIP vérifie désormais les chemins avant extraction ;
- launcher.py compare la version du serveur réellement actif avec la version installée.

Le dossier data/ et le dossier user/ ne sont jamais inclus dans ce paquet.
