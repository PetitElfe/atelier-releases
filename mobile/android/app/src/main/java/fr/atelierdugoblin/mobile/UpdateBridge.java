package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

/**
 * Safe private-repository update path: open the releases page in the user's
 * authenticated browser. Never embed GitHub credentials in an APK.
 * Android checks the signing certificate before accepting an update.
 */
public final class UpdateBridge {
    private static final String RELEASES =
        "https://github.com/PetitElfe/atelier-releases/releases";
    private final Activity activity;

    UpdateBridge(Activity activity) { this.activity = activity; }

    /** Share a user-initiated JSON backup through Android's native chooser. */
    @JavascriptInterface public void shareBackup(String json) {
        if (json == null || json.length() > 1024 * 1024) return;
        activity.runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/json");
            send.putExtra(Intent.EXTRA_SUBJECT, "Sauvegarde Atelier du Goblin mobile");
            send.putExtra(Intent.EXTRA_TEXT, json);
            activity.startActivity(Intent.createChooser(send, "Sauvegarder mes données"));
        });
    }

    /** Display the actually installed APK version, not a hard-coded UI value. */
    @JavascriptInterface public String getVersionName() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (android.content.pm.PackageManager.NameNotFoundException ex) {
            return "inconnue";
        }
    }

    @JavascriptInterface public void openReleases() {
        activity.runOnUiThread(() ->
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES))));
    }
}
