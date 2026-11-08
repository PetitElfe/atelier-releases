# Refonte visuelle TEST — 8 novembre 2026

Source : onglet de modifications, ses captures et ses quatre commentaires ; PDF de 11 pages (empreinte 505cfd7b75872a274616fb7aa6aede48018c8df827ce4650ad7b890c9fe6fca6). Comparaison avec la passation, la source de vérité, les vérifications précédentes, l’audit, le journal verbatim, le contexte et la roadmap. Le PDF dupliqué est identique. Les données et images personnelles ne sont pas copiées dans le dépôt.

Les neuf extensions facultatives anciennes ne deviennent pas implicitement prioritaires. Le JDR, main et les installations réelles restent hors modification. Le brouillon alimentaire du 8 novembre demeure non validé ; aucune analyse nutritionnelle automatique n’est développée.

## Périmètre à vérifier

| Groupe | Résultat attendu | État de développement initial |
| --- | --- | --- |
| Trackers | Tableaux plats, onglets clairs/sombres, To-do en premier, plusieurs tableaux par onglet, ajout gris + | Développé, validation en cours |
| Trackers | Actions tableau/ligne au clic droit, édition modale, réorganisation sans poignée visible, duplication et archivage conservant l’historique | Développé, validation en cours |
| Trackers | Clic +1, couleurs par ligne, progression des étapes du bas vers le haut, étapes par jour de semaine | Développé, validation en cours |
| Rythmes | Jours, semaines ISO (52 ou 53), quinzaine, mois, trimestre, semestre, année ; titres sans barre de dates redondante | Développé, validation en cours |
| Accueil | Liste quotidienne liée aux mêmes cases ; exclusion des tableaux purement hebdomadaires | Développé, validation en cours |
| Budget | Feuille du mois : revenus, charges fixes/variables, crédits, notes, lignes + ; anciennes opérations et modes de reste conservés | Développé, validation en cours |
| Budget | Enveloppes mensuelles liées aux catégories, dépassement visible ; bocaux de projet/économies avec historique d’affectation | Développé, validation en cours |
| Budget | Courses avec quantités, prix, couleurs et total ; liste d’achats prévus ; accès aux mois antérieurs sans effacement | Développé, validation en cours |
| Albums | Étagères, albums nommés, pages ; photos personnelles, Polaroids, légendes, scotchs, polices, stickers, cadrage et redimensionnement | Développé, validation en cours |
| Dessin | Traits au stylet avec pression, gomme, annuler/rétablir ; sauvegarde des vecteurs et photos dans SQLite | Développé, validation en cours |
| Bibliothèque | Tableaux et listes conservés au rechargement ; insertion de schémas dessinés ; accès au journal privé sans recopier son contenu dans les notes partagées | Développé, validation en cours |
| Vie quotidienne | Exercices, consignes, répétitions, minuteur et lien explicite avec une ligne du tracker ; journal de repas et déduction de stock confirmée | Développé, validation en cours |
| Outils | Cartes recto/verso, questions/réponses, image et transparence ; activités détente et vrais sons importés | Développé, validation en cours |
| Post-it | Menus contextuels, formats carré/feuille/bandeau, couleurs ; conservation du verrouillage et des archives | Développé, validation Windows à compléter |
| Android | Présentation compacte, To-do/trackers par semaine, appui long, édition d’album page par page et ajout de photos | À développer |
| Android | Calendrier jour/semaine/mois/année, ouverture sur aujourd’hui ; courses détaillées et cartes personnalisées | À développer |
| Android | Recette flottante, sport/minuteurs, respiration cercle ou barre avec étoile orientée vers le haut, phrases et ambiances | À développer |
| Android | Widget d’échéances et indicateur du cycle ; maintien des rappels natifs et minuteurs écran verrouillé | À développer |
| Synchronisation | File durable, reçu par action, conflits visibles, album sauvegardé et récupérable hors connexion après appairage | À développer côté Android |

La colonne Développé ne signifie ni tests réussis ni validation utilisateur. Les résultats et les limites réelles sont ajoutés après exécution des contrôles. Aucun point manuel n’est coché à distance.
