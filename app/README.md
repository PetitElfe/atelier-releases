# L’Atelier 0.9.0

Refonte complète du bloc Objectifs en **Bibliothèque**.

## Nouvelle logique

L’espace n’est plus présenté comme une carte technique d’objectifs. La Bibliothèque est maintenant organisée en **domaines** : Anglais, Art, JDR, League of Legends, etc.

Chaque domaine est un espace vivant avec :
- ses **carnets** ;
- ses **sous-objectifs, étapes et sous-étapes** ;
- ses **tâches liées** ;
- son **avancée globale**.

## Création d’un domaine

Lors de la création d’un domaine, L’Atelier propose un petit constructeur :
- nom et description ;
- carnets de départ, un par ligne ;
- premiers sous-objectifs, un par ligne.

Tout reste modifiable ensuite.

## Dans un domaine

La colonne de gauche contient :
- le module **Carnets**, avec ajout de carnets à tout moment ;
- juste dessous, le module **Avancée**, avec progression globale, objectifs, tâches et nombre de carnets.

La grande zone de droite contient :
- une **Vue d’ensemble** des sous-objectifs et tâches ;
- ou le contenu du **carnet sélectionné**.

Un carnet contient des pages libres avec :
- titre ;
- notes ;
- lien facultatif ;
- état traité / non traité.

Les pages sont présentées comme de petites feuilles de carnet pour rendre l’ensemble plus visuel et moins technique.

## Configuration

Chaque domaine possède un bouton **Configurer** permettant de modifier son identité, son état et sa progression, et d’accéder rapidement à l’ajout d’un carnet, d’un sous-objectif ou d’une tâche.

Les tâches générales peuvent toujours être rattachées à un domaine ou à un sous-objectif.

## Compatibilité

La structure de données de la 0.8.0 est conservée : cette version est principalement une refonte d’interface et d’ergonomie. Les domaines et sous-objectifs déjà créés restent disponibles.

Aucune donnée existante n’est supprimée.
