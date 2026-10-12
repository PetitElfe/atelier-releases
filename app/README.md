# L’Atelier 0.10.0

Refonte du cœur de la Bibliothèque pour correspondre au modèle :

**Domaine → objectif principal → sous-objectifs / niveaux → étapes / compétences**, avec les carnets à côté de la progression.

## Exemple Anglais

- Domaine : Anglais
- Objectif principal : Devenir bilingue
- Sous-objectifs / niveaux : A1, A2, B1, B2, C1, C2
- Sous chaque niveau : les compétences et étapes concrètes nécessaires pour l’atteindre
- Carnets indépendants : Grammaire, Vocabulaire, Cours, Journal, etc.

## Constructeur de domaine

À la création d’un domaine, on peut maintenant préparer en une seule fois :
- le nom du domaine ;
- sa description ;
- son objectif principal ;
- ses niveaux / sous-objectifs, un par ligne ;
- ses carnets de départ, un par ligne.

Le constructeur crée la hiérarchie automatiquement.

## Vrais carnets éditables

Un carnet n’est plus une grille de petites fiches à modifier avec des fenêtres.

Quand un carnet est ouvert :
- les pages sont listées sur le côté ;
- une page s’ouvre comme une vraie feuille ;
- le titre s’écrit directement ;
- le texte s’écrit directement dans la page ;
- les modifications sont enregistrées automatiquement ;
- un mode **Écrire** et un mode **Lire** permettent de travailler puis de consulter le rendu ;
- ajouter une page l’ouvre immédiatement pour écrire.

## Liens entre pages

Dans une page, on peut sélectionner un mot ou un groupe de mots puis créer un **lien vers une autre page** du domaine.

Le lien possède :
- le mot affiché ;
- la page cible ;
- un **type de lien personnalisable**, par exemple Vocabulaire, Exemple, Prérequis, À revoir, Référence…

En mode Lire, le mot devient cliquable et le type du lien reste visible. Cliquer dessus ouvre directement la page cible.

Une page affiche aussi les pages qui pointent vers elle dans **Liens vers cette page**.

Les liens internes utilisent l’identifiant de la page cible : renommer cette page ne casse pas le lien.

## Liens web sous forme de mots

On peut aussi sélectionner un mot, choisir **Lien web**, coller une URL et conserver seulement le mot choisi dans le rendu.

Exemple : au lieu d’afficher une longue URL, la page peut simplement afficher **Cambridge Dictionary** comme lien cliquable.

## Page traitée sans saut

Marquer une page comme traitée ne recharge plus le carnet et ne fait plus sauter l’interface. L’état est mis à jour sur place.

Aucune donnée existante n’est supprimée.
