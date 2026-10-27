package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class UpdateBridge {
    private final Activity activity;
    private final WebView webView;
    // Only the official repository's public releases are trusted.
    private static final String API = "https://api.github.com/repos/PetitElfe/atelier-releases/releases?per_page=30";
    UpdateBridge(Activity activity, WebView webView) { this.activity = activity; this.webView = webView; }

    @JavascriptInterface public void check() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection)new URL(API).openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                if (connection.getResponseCode() != 200) throw new Exception("Aucune mise à jour publique disponible.");
                byte[] data;
                try(InputStream in = connection.getInputStream()) { data = in.readAllBytes(); }
                JSONArray releases = new JSONArray(new String(data, StandardCharsets.UTF_8));
                JSONObject release = null;
                for (int i=0;i<releases.length();i++) {
                    JSONObject candidate = releases.optJSONObject(i);
                    if (candidate != null && !candidate.optBoolean("draft") && !candidate.optBoolean("prerelease") &&
                        candidate.optString("tag_name").matches("android-v[0-9]+\\\\.[0-9]+\\\\.[0-9]+")) {
                        if (release == null || compare(candidate.optString("tag_name").substring(9), release.optString("tag_name").substring(9)) > 0) release = candidate;
                    }
                }
                if (release == null) throw new Exception("Aucune version Android publiée.");
                String tag = release.optString("tag_name");
                // Mobile releases use android-vMAJOR.MINOR.PATCH.
                if (!tag.matches("android-v[0-9]+\\.[0-9]+\\.[0-9]+")) throw new Exception("Aucune version Android publiée.");
                String latest = tag.substring("android-v".length());
                String current = getVersion();
                if (compare(latest, current) <= 0) { notifyWeb("Ton Atelier est à jour.", null); return; }
                JSONArray assets = release.optJSONArray("assets");
                String apk = null;
                if (assets != null) for (int i=0;i<assets.length();i++) {
                    JSONObject a = assets.optJSONObject(i);
                    if (a != null && a.optString("name").equals("LAtelierDuGoblin-Mobile.apk")) apk=a.optString("browser_download_url");
                }
                if (apk == null || !apk.startsWith("https://github.com/PetitElfe/atelier-releases/releases/download/"))
                    throw new Exception("Le fichier de mise à jour n'est pas disponible.");
                notifyWeb("Nouvelle version " + latest + " disponible.", apk);
            } catch(Exception e) { notifyWeb(e.getMessage(), null); }
            finally { if (connection != null) connection.disconnect(); }
        }).start();
    }

    @JavascriptInterface public void download(String url) {
        if (url == null || !url.startsWith("https://github.com/PetitElfe/atelier-releases/releases/download/") ||
            !url.endsWith("/LAtelierDuGoblin-Mobile.apk")) { notifyWeb("Lien de mise à jour refusé.", null); return; }
        activity.runOnUiThread(() -> {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("Mise à jour de L'Atelier du Goblin");
                request.setDescription("Ouvre le téléchargement terminé pour autoriser l'installation.");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "LAtelierDuGoblin-Mobile.apk");
                ((DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
                notifyWeb("Téléchargement lancé. Ouvre le fichier téléchargé pour installer la mise à jour.", null);
            } catch(Exception e) { notifyWeb("Téléchargement impossible : " + e.getMessage(), null); }
        });
    }
    private String getVersion() {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName.split("-")[0]; }
        catch(Exception e) { return "0.0.0"; }
    }
    private static int compare(String a,String b) {
        String[] aa=a.split("\\."), bb=b.split("\\.");
        for(int i=0;i<3;i++){int x=Integer.parseInt(aa[i]),y=i<bb.length?Integer.parseInt(bb[i]):0;if(x!=y)return Integer.compare(x,y);}
        return 0;
    }
    private void notifyWeb(String message,String url) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(
            "window.onAtelierUpdate && window.onAtelierUpdate(" + JSONObject.quote(message) + "," +
            (url==null?"null":JSONObject.quote(url)) + ")",null));
    }
}
