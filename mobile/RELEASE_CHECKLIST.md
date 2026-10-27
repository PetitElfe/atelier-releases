# Android release checklist — before first installation

**Do not distribute the prototype debug APK as the permanent install.** GitHub Actions debug builds may be signed with a different debug certificate on each runner, making future updates fail.

1. Generate a dedicated Android release signing keystore **locally**; never commit it.
2. Save the keystore and passwords securely; back them up offline.
3. Configure GitHub Actions secrets for the signing material and use the **same signing certificate for every release**.
4. Produce an APK signed by the release certificate, with an incrementing `versionCode` and `versionName`.
5. Upload the signed APK as a public GitHub release asset named `LAtelierDuGoblin-Mobile.apk` with a tag like `android-v0.1.0`.
6. Install that signed APK once on the phone; later releases can replace it if package ID and signing certificate remain unchanged.
7. Test download and install on a physical device. Android requires user confirmation for APK installs; it cannot be silently bypassed.
8. Add APK signature verification / checksum checks and a safer update download destination before production.
9. Keep mobile data separate from the Windows stable installation until authenticated sync and conflict handling are tested.

Current updater: checks public GitHub releases on request, shows a new version and downloads the official APK into Downloads. It does **not** auto-install. It does **not** check a cryptographic manifest beyond the normal Android installer signature enforcement. Private GitHub releases cannot be fetched without authentication.
