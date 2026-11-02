# Bibliothèque et calendrier — candidate Windows TEST du 3 novembre 2026

Branche isolée : `test/windows-library-calendar-20261103`. PR #130.
Cette candidate n'est ni installée sur le PC, ni intégrée au canal TEST partagé avec Nathan.

## Bibliothèque

- Ouvrir un domaine : les livres de l'étagère représentent ses vrais carnets.
- Cliquer sur le livre gris ＋ pour créer un carnet ; les pages restent à l'intérieur du carnet.
- Revenir dans un carnet : retrouver la dernière page consultée, ou la dernière page de la liste à la première ouverture.
- Explorer le parcours à la souris/molette. Le bouton crayon active le déplacement des étapes et les liaisons ; « Terminer » revient en consultation.
- Les chemins pleins représentent des liaisons explicites ; les pointillés représentent la hiérarchie existante, sans ajouter de prérequis.
- Cliquer sur une étape pour voir ses tâches ; en mode crayon, modifier l'étape ou ajouter un élément dessous.
- « Voir la liste » conserve l'arborescence historique, « Recentrer » cadre les étapes.

## Calendrier

Bouton « Décorer » ou clic droit dans une case → « Décorer ce jour / ce mois ».
Choisir la portée, importer un PNG/JPEG/WebP, régler l'opacité de 0 à 100 % et activer une couleur de numéro. Enregistrer applique les réglages ; Annuler les abandonne.

Les réglages individuels prennent la priorité sur ceux du mois. « Masquer l'image » retire l'image sur cette portée. « Réglages par défaut » retire les choix de cette portée ; un jour reprend alors ceux du mois.

Les images sont redimensionnées et enregistrées dans le stockage local de l'interface, par installation. Elles persistent lors d'une mise à jour normale du même profil ; elles ne sont pas incluses dans la sauvegarde SQLite et ne se synchronisent pas vers Android. Ne pas vider les données du profil pour mettre à jour. Un manque d'espace refuse la nouvelle sauvegarde et conserve l'ancien réglage.

Le bloc « Goblin grognon » indique les règles saisies en cours ou le compte à rebours estimé. Il ne prédit pas les symptômes. Les deux réglages historiques (en-tête et marques) restent indépendants.

## Vérifications sur le PC de Léo — à cocher après installation consentie

- [ ] Ouvrir l'installation Windows TEST, port 8876, et vérifier la révision ; garder stable 8765 et Nathan 8877 séparés.
- [ ] Retrouver les domaines, carnets, textes et mises en forme existants.
- [ ] Créer un carnet depuis le livre gris, écrire, changer de carnet puis revenir immédiatement : texte et dernière page conservés.
- [ ] Explorer, zoomer, déplacer une étape avec le crayon ; terminer, fermer et rouvrir : position et liens conservés.
- [ ] Vérifier la liste, les tâches d'une étape et le recentrage.
- [ ] Décorer un mois, puis un jour : image, opacité, couleur, masque et retour aux réglages mensuels.
- [ ] Fermer et rouvrir : décoration conservée, rendez-vous lisibles et intacts.
- [ ] Vérifier bandes de règles entières, un seul bloc Goblin grognon et centrage de l'indicateur au survol.
- [ ] Vérifier semaine, création/modification de rendez-vous, rappels liés, accueil et trackers.

Les contrôles automatiques ne remplacent pas cette validation sur l'appareil réel.
