# L’Atelier 0.5.1

Bloc Accueil / disposition :
- bouton global « Modifier » placé à côté de « Aujourd’hui » ;
- déplacement et redimensionnement des principaux éléments par glisser-déposer ;
- taille et position conservées dans le navigateur ;
- semainier desktop plus large par défaut et toujours redimensionnable ;
- les titres des recettes ouvrent directement leur carnet ;
- « Ajouter une idée de repas… » depuis l’accueil ouvre maintenant réellement la création d’une recette.

Fiabilité :
- la version du serveur est lue depuis `VERSION` au lieu d’être dupliquée à plusieurs endroits ;
- les fichiers de l’interface ne restent plus bloqués dans le cache du navigateur après une mise à jour ;
- l’arrêt propre par `/api/shutdown` fonctionne aussi en POST, ce qui permet à une nouvelle instance de remplacer correctement l’ancienne sur le port 8765.

Aucune migration de données n’est nécessaire pour cette version.
