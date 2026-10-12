# L’Atelier 0.6.1

Navigation et rappels :
- les onglets du haut deviennent un menu latéral gauche, dans l’esprit d’une barre de navigation d’application ;
- une flèche permet de rabattre le menu ; elle se retourne pour indiquer qu’il peut être rouvert ;
- l’état ouvert/rabattu est mémorisé ;
- le menu propose des raccourcis permanents « + Rendez-vous » et « + Rappel » ;
- la page Rappels permet maintenant de créer des rappels totalement indépendants du calendrier et des tâches ;
- un rappel indépendant peut être modifié, reporté, terminé ou supprimé ;
- la base est migrée automatiquement vers le schéma 2 pour accepter ces rappels ;
- l’enregistrement d’un rendez-vous affiche désormais une erreur directement dans sa fenêtre si quelque chose échoue, au lieu de donner l’impression que le bouton ne fait rien.

Les rendez-vous restent visibles dans le calendrier, mais leur création n’est plus dépendante du fait d’être déjà dans la vue Calendrier.
