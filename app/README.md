# L’Atelier 0.5.3

Corrections après test de la bibliothèque Cuisine :
- scrollbar du semainier et des zones défilantes harmonisée avec le thème sombre ;
- les livres de recettes (sauf « À classer ») peuvent être renommés et supprimés ;
- supprimer un livre ne supprime pas ses recettes : elles sont déplacées dans « À classer » ;
- une recette peut être archivée depuis la bibliothèque ;
- quand la bibliothèque est vide, un bouton crée une « Potiflette — recette de test » pour vérifier la recherche, les portions, les idées de repas et le carnet.

Import de recettes :
- le bouton devient « Importer une recette » ;
- il accepte soit le texte copié, soit directement une URL http/https ;
- pour une URL, L’Atelier cherche les données structurées Recipe de la page et préremplit le titre, les portions, les ingrédients, les étapes, la description et l’image quand elles sont disponibles ;
- aucune recette importée n’est enregistrée sans passer par l’éditeur de vérification ;
- si le site ne fournit pas de recette structurée ou bloque la lecture, le copier-coller manuel reste disponible.
