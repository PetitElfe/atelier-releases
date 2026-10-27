# L'Atelier du Goblin — Android (prototype isolé)

Cette première version est **un prototype Android hors ligne** et ne communique pas avec l'installation Windows, le serveur Python ou la base SQLite existante.

## Fonctions de ce prototype
- Journal vertical avec sections configurables et réordonnables.
- Habitudes, tâches et courses à cocher.
- Ajout et suppression de tâches, courses, habitudes et notes.
- Export manuel d'une sauvegarde JSON via le partage Android (ou téléchargement en navigateur).
- Les données exportées peuvent être sensibles : choisir une destination de confiance. La restauration automatique n'est pas encore disponible.
- Persistance locale via WebView localStorage (prototype uniquement).
- Calendrier local : ajout et suppression de rendez-vous (sans synchronisation Windows).
- Balayage horizontal pour changer de page ; défilement vertical conservé.
- Note rapide avec choix de destination (pensées, tâches, courses, habitudes).

## Construction
Le workflow GitHub Actions `Android mobile prototype APK` copie `mobile/prototype/index.html` dans les assets Android, puis construit et teste un APK **debug**. Cet APK de CI est uniquement destiné aux essais ; les versions à installer durablement sont produites par le workflow manuel signé `Android mobile signed release` avec la clé permanente, depuis `main`. Un test d'émulateur ne remplace pas un test sur téléphone réel.

## Limites importantes
- Pas de synchronisation Wi-Fi ni Internet.
- Pas de notifications Android ni de sonnerie intégrée.
- Pas encore de stockage SQLite natif, de restauration automatique ni de migrations : ne pas saisir de données importantes. La sauvegarde JSON est une copie de secours, pas une garantie de restauration.
- La suppression de l'application peut effacer les données du prototype.
- Aucun accès à la version Windows stable ni à ses données.
- La synchronisation future exigera un appairage authentifié et une gestion des conflits.

La présence du code mobile sur `main` ne déploie rien sur les installations Windows : la synchronisation demeure désactivée et le service TEST est indépendant. Ne jamais exécuter le serveur avec des données réelles sur HTTP non chiffré.
