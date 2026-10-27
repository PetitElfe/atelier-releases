# Android release checklist — permanent install

## One-time private signing configuration

A permanent Android signing key must be kept **outside the repository** and backed up securely. Do not commit the key, its password, or base64 text to GitHub.

The GitHub Actions release workflow expects these **repository secrets**:
- `ATELIER_ANDROID_KEYSTORE_B64`: base64-encoded contents of the PKCS12/JKS keystore file
- `ATELIER_ANDROID_STORE_PASSWORD`: keystore password
- `ATELIER_ANDROID_KEY_PASSWORD`: private key password
- `ATELIER_ANDROID_KEY_ALIAS`: key alias

Create these via GitHub repository Settings → Secrets and variables → Actions → New repository secret. The assistant cannot create repository secrets through the available GitHub connector. Keep an offline backup of the keystore and passwords; losing them prevents seamless upgrades.

## Release procedure

1. Validate the prototype Android build and emulator smoke test.
2. Confirm the four repository secrets are present.
3. Trigger the `Android mobile signed release` workflow on the mobile feature branch with version `0.1.0` (workflow must be registered in the repository Actions UI; first activation may require an authorized maintainer to merge the workflow into the default branch).
4. The workflow signs `app-release.apk` with the permanent keystore, verifies the signature and publishes a public GitHub release `android-vX.Y.Z` with `LAtelierDuGoblin-Mobile.apk`.
5. Install that **signed** APK once. Subsequent signed releases with higher version codes and the same certificate can upgrade it.
6. Test the update check/download/install flow on a real Android phone.

## Known limitations

- Android requires user approval to install an APK update.
- Current updater checks public GitHub releases and downloads the new APK into Downloads. It does not silently install.
- This is still a prototype; no Wi-Fi sync, native reminder notifications or production-grade backup.
- The Windows stable application and its data remain untouched.
