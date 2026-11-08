# Refonte visuelle TEST — 8 novembre 2026

Source : onglet de modifications, ses captures et ses quatre commentaires ; PDF de 11 pages (empreinte 505cfd7b75872a274616fb7aa6aede48018c8df827ce4650ad7b890c9fe6fca6). Comparaison avec la passation, la source de vérité, les vérifications précédentes, l’audit, le journal verbatim, le contexte et la roadmap. Le PDF dupliqué est identique. Les données et images personnelles ne sont pas copiées dans le dépôt.

Les neuf extensions facultatives anciennes ne deviennent pas implicitement prioritaires. Le JDR, main et les installations réelles restent hors modification. Le brouillon alimentaire du 8 novembre demeure non validé ; aucune analyse nutritionnelle automatique n’est développée.

## Périmètre à vérifier

| Groupe | Résultat attendu | État et vérification |
| --- | --- | --- |
| Trackers | Tableaux plats, onglets clairs/sombres, To-do en premier, plusieurs tableaux par onglet, ajout gris + | Développé ; essais automatiques réussis |
| Trackers | Actions tableau/ligne au clic droit, édition modale, réorganisation sans poignée visible, duplication et archivage conservant l’historique | Développé ; essais automatiques réussis |
| Trackers | Clic +1, couleurs par ligne, progression des étapes du bas vers le haut, étapes par jour de semaine | Développé ; essais automatiques réussis |
| Rythmes | Jours, semaines ISO (52 ou 53), quinzaine, mois, trimestre, semestre, année ; titres sans barre de dates redondante | Développé ; essais automatiques réussis |
| Accueil | Liste quotidienne liée aux mêmes cases ; exclusion des tableaux purement hebdomadaires | Développé ; essais automatiques réussis |
| Budget | Feuille du mois : revenus, charges fixes/variables, crédits, notes, lignes + ; anciennes opérations et modes de reste conservés | Développé ; essais automatiques réussis |
| Budget | Enveloppes mensuelles liées aux catégories, dépassement visible ; bocaux de projet/économies avec historique d’affectation | Développé ; essais automatiques réussis |
| Budget | Courses avec quantités, prix, couleurs et total ; liste d’achats prévus ; accès aux mois antérieurs sans effacement | Développé ; essais automatiques réussis |
| Albums | Étagères, albums nommés, pages ; photos personnelles, Polaroids, légendes, scotchs, polices, stickers, cadrage et redimensionnement | Développé ; essais automatiques réussis |
| Dessin | Traits au stylet avec pression, gomme, annuler/rétablir ; sauvegarde des vecteurs et photos dans SQLite | Développé ; essais automatiques réussis |
| Bibliothèque | Tableaux et listes conservés au rechargement ; insertion de schémas dessinés ; accès au journal privé sans recopier son contenu dans les notes partagées | Développé ; essais automatiques réussis |
| Vie quotidienne | Exercices, consignes, répétitions, minuteur et lien explicite avec une ligne du tracker ; journal de repas et déduction de stock confirmée | Développé ; essais automatiques réussis |
| Outils | Cartes recto/verso, questions/réponses, image et transparence ; activités détente et vrais sons importés | Développé ; essais automatiques réussis |
| Post-it | Menus contextuels, formats carré/feuille/bandeau, couleurs ; conservation du verrouillage et des archives | Développé ; auto-test Windows réussi, rendu réel à vérifier |
| Android | Présentation compacte, To-do/trackers par semaine, appui long, édition d’album page par page et ajout de photos | Développé ; essais navigateur réussis, APK en vérification |
| Android | Calendrier jour/semaine/mois/année, ouverture sur aujourd’hui ; courses détaillées et cartes personnalisées | Développé ; essais navigateur réussis, APK en vérification |
| Android | Recette flottante, sport/minuteurs, respiration cercle ou barre avec étoile orientée vers le haut, phrases et ambiances | Développé ; essais navigateur réussis, APK en vérification |
| Android | Widget d’échéances et indicateur du cycle ; maintien des rappels natifs et minuteurs écran verrouillé | Développé ; essais navigateur réussis, APK en vérification |
| Synchronisation | File durable, reçu par action, conflits visibles, album sauvegardé et récupérable hors connexion après appairage | Développé ; essais hors connexion et conflits réussis |

La colonne Développé ne signifie ni tests réussis ni validation utilisateur. Les résultats et les limites réelles sont ajoutés après exécution des contrôles. Aucun point manuel n’est coché à distance.

## Preuves et limites

- 132 tests Python exécutés localement, dont 4 contrôles réservés à Windows ignorés sur Linux. Contrôles de release et scripts JavaScript réussis.
- Essais PC réels sur profil jetable : clic +1, menus, renommage, progression trimestrielle avec 4 cases, lien de l’accueil, classement des charges fixes/crédits/variables, notes mensuelles, bocaux, déplacement et encre des albums, tableaux de carnet persistants.
- Essais Android avec vrai serveur PC et frontière du pont natif : photo et deux révisions hors connexion, fermeture/réouverture, sauvegarde et restauration IndexedDB, reconnexion, réponse perdue, conflit PC conservé, catégories/prix des courses, calendrier annuel et création, ancienne note et brouillon, appel au minuteur natif de sport, cartes et respiration.
- Les pages de ménage mensuel/trimestriel/semestriel/annuel proposent 12/4/2/1 cases sur l’année ; les anciennes grilles conservent leur cadence et leurs marques. Semaines ISO 53 puis 1 vérifiées.
- Premier passage distant Windows réussi : https://github.com/PetitElfe/atelier-releases/actions/runs/42533519386 (révision 690ec279f39a216597c88a1c0bb3f812177dcb5f). Un nouveau passage couvre les dernières corrections et le lanceur CMD incomplet.
- Android 0.1.15 compile, garde le certificat permanent de 0.1.14 et passe les essais navigateur distants. La mise à niveau signée sur émulateur et les alertes écran éteint conditionnent la publication du candidat final.

À effectuer sur les appareils de Léo : ouverture des anciennes données après extraction complète du ZIP, stylet XP-Pen et son pilote de pression, Post-it du Bureau, ajout/rendu du widget dans le lanceur réel, autorisations Android et sons personnels, connexion Tailscale réelle. Aucun de ces essais manuels n’est coché à distance. Les ambiances demandent un vrai fichier sonore personnel. Le mode Mes dessins reste protégé par le mot de passe local à définir.

Le retrait du stock après un repas propose les aliments dont le nom apparaît dans la note, puis demande les unités exactes et une confirmation. Il n’invente pas une quantité consommée. Les règles alimentaires du document de brouillon ne sont pas activées.
