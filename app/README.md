# L’Atelier 0.12.1

Correctif ergonomique du bloc Bibliothèque / carnets.

## Sauvegarde fiable

- quitter la Bibliothèque vers l’Accueil ou un autre onglet force immédiatement la sauvegarde de la page courante ;
- le contenu est aussi mis à jour en mémoire avant le changement d’écran ;
- revenir tout de suite sur le carnet ne doit plus faire réapparaître une ancienne version ;
- fermeture / arrière-plan gardent la sauvegarde de sécurité introduite en 0.12.0.

## Annuler / rétablir

Les boutons ↶ et ↷ utilisent désormais un historique géré par L’Atelier :
- Ctrl+Z annule ;
- Ctrl+Y ou Ctrl+Maj+Z rétablit ;
- texte et mise en forme sont suivis dans le même historique.

## Liens pendant l’écriture

Les liens sont actifs même en mode Écrire :
- clic sur un lien web : ouvre le site ;
- clic sur un lien interne : ouvre la page liée ;
- clic droit sur un lien : permet de le modifier ;
- le mot, l’adresse / la cible et le type de lien restent modifiables.

## Lecture

- suppression de l’effet de mouvement de page ;
- feuille de lecture plus large ;
- en taille normale : une seule page ;
- en mode agrandi : choix entre une page ▯ ou deux pages ▯▯ ;
- les flèches avancent d’une page en mode simple et de deux pages en mode double ;
- numéro de page et sommaire cliquable conservés.

## Création d’une page

Créer une nouvelle page ne recharge plus toute la bibliothèque : elle est ajoutée puis ouverte directement, pour éviter le saut visuel.

## Éditeurs de structure

Les fenêtres de création / configuration du domaine et du carnet gardent un vrai bouton Enregistrer. Entrée ne valide pas ces formulaires.

Aucune donnée existante n’est supprimée.
