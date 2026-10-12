# L’Atelier 0.8.0

Bloc Objectifs — carte complète et bibliothèques adaptables :

- nouvel espace **Objectifs** dans le tiroir de navigation ;
- construction libre d’une carte hiérarchique avant même l’objectif : **Domaine → Objectif → Étape → Sous-étape** ;
- chaque élément peut être ajouté, modifié, déplacé sous un autre parent, mis en pause, terminé ou supprimé ;
- avancement de 0 à 100 % visible directement dans la carte ;
- suppression en cascade des sous-éléments, sans supprimer les tâches : elles sont simplement détachées ;
- les tâches peuvent maintenant être reliées à n’importe quel élément de la carte ;
- depuis la fiche d’un objectif/étape, création rapide d’une tâche liée ;
- l’accueil « Que faire maintenant ? » n’utilise plus une liste fixe : il affiche les vrais objectifs actifs ;
- chaque élément dispose de sa propre **bibliothèque personnalisable** ;
- éditeur de sections de bibliothèque avec types : ressources, cours, exercices, références, inspirations, notes ou personnalisé ;
- chaque section accepte des entrées avec titre, lien, notes et état traité/non traité ;
- aucune structure de bibliothèque n’est imposée : Anglais, Art, JDR, LoL, etc. peuvent avoir des besoins totalement différents.

La base de données passe au schéma 3 ; une sauvegarde automatique est créée avant migration.
Aucune donnée existante n’est supprimée.
