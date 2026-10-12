# L’Atelier 0.6.0

Fondations / fiabilité après audit :
- sauvegarde automatique de la base SQLite avant une migration de schéma ;
- version de schéma suivie avec `PRAGMA user_version` ;
- SQLite utilise un délai d’attente et le mode WAL pour mieux résister aux accès concurrents ;
- les rappels comparent désormais des heures locales avec des heures locales : plus de décalage UTC été/hiver ;
- un rappel reporté peut de nouveau notifier lorsqu’il arrive à sa nouvelle heure ;
- les récurrences mensuelles conservent leur jour d’origine (ex. 31 janvier → 28 février → 31 mars) ;
- l’import de recette revalide les redirections et refuse les redirections vers une adresse locale/privée ;
- l’arrêt du serveur n’est plus disponible en GET, uniquement en POST ;
- le port du serveur peut être changé par `ATELIER_PORT`, ce qui permet des tests de démarrage isolés.

Cette version introduit aussi une vérification automatisée de release dans le dépôt GitHub afin de détecter les erreurs de syntaxe, les manifestes incohérents et les échecs de démarrage avant publication.
