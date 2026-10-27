# Synchronisation locale — protocole en préparation

La synchronisation PC ↔ Android **n'est pas activée dans cette version**. Les données actuelles de l'APK restent uniquement dans le stockage local de WebView.

## Contraintes de sécurité
- Ne jamais écrire directement dans la base de données Windows stable `E:\\00_LATELIER`.
- Développer et tester d'abord avec `E:\\LATELIER_TEST_0180` et une base de test distincte.
- Exiger un appairage explicite et une authentification; aucune API locale anonyme.
- Prévoir un journal des modifications, des identifiants uniques par entrée, une gestion des suppressions et des conflits; ne pas remplacer un ensemble complet de données par le dernier appareil connecté.
- Définir les règles de fusion pour tâches, habitudes, courses et notes; conserver les conflits au lieu de perdre des données.
- Tester redémarrages, coupures Wi-Fi, doublons, dates, fuseaux horaires et sauvegardes avant la première synchronisation réelle.

## Première livraison Android
La correction d'affichage de la barre d'état peut être publiée indépendamment de la synchronisation. Elle n'exige aucune migration des données.
