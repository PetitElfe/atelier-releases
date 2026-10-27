# L'Atelier du Goblin — Android (prototype isolé)

Cette première version est **un prototype Android hors ligne** et ne communique pas avec l'installation Windows, le serveur Python ou la base SQLite existante.

## Fonctions de ce prototype
- Journal vertical avec sections configurables et réordonnables.
- Habitudes, tâches et courses à cocher.
- Ajout de tâches, courses et notes.
- Persistance locale via WebView localStorage (prototype uniquement).
- Calendrier encore fictif.

## Construction
Le workflow GitHub Actions `Android mobile prototype APK` copie `mobile/prototype/index.html` dans les assets Android, puis construit un APK **debug**. Télécharger l'artefact `LAtelierDuGoblin_Android_Prototype_APK` depuis le workflow. Cet APK n'est pas encore une version finale.

## Limites importantes
- Pas de synchronisation Wi-Fi ni Internet.
- Pas de notifications Android ni de sonnerie intégrée.
- Pas encore de stockage SQLite natif, sauvegarde ou migrations : ne pas saisir de données importantes.
- La suppression de l'application peut effacer les données du prototype.
- Aucun accès à la version Windows stable ni à ses données.
- La synchronisation future exigera un appairage authentifié et une gestion des conflits.

Ne pas fusionner avec la branche de production avant validation humaine.
