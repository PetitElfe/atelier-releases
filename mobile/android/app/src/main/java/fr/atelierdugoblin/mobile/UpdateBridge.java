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

    @JavascriptInterface public void openReleases() {
        activity.runOnUiThread(() ->
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES))));
    }
}
