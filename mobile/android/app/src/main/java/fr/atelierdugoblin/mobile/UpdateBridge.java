package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Public GitHub releases only; no token, no silent installation, no other APK origins. */
public final class UpdateBridge {
    private static final String REPO = "PetitElfe/atelier-releases";
    private static final String RELEASES = "https://github.com/" + REPO + "/releases";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases?per_page=40";
    private static final Pattern TAG = Pattern.compile("^android-v([0-9]{1,2})\\.([0-9]{1,2})\\.([0-9]{1,2})$");
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile String apkUrl;
    private volatile String shaUrl;
    private volatile int availableCode;
    private volatile String availableVersion;

    UpdateBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface public String currentVersion() {
        try {
            PackageInfo p = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            JSONObject result = new JSONObject();
            result.put("version", p.versionName);
            result.put("code", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
            return result.toString();
        } catch (Exception e) { return "{\"version\":\"inconnue\",\"code\":0}"; }
    }

    @JavascriptInterface public void openReleases() {
        activity.runOnUiThread(() ->
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES))));
    }

    private void event(String type, String message, String version) {
        JSONObject result = new JSONObject();
        try {
            result.put("type", type);
            result.put("message", message);
            result.put("version", version == null ? "" : version);
        } catch (Exception ignored) { }
        final String script = "window.__atelierUpdateResponse&&window.__atelierUpdateResponse(" +
            JSONObject.quote(result.toString()) + ");";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private int codeForTag(String tag) {
        Matcher m = TAG.matcher(tag);
        if (!m.matches()) return -1;
        int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2)), c = Integer.parseInt(m.group(3));
        if (a > 99 || b > 99 || c > 99) return -1;
        return a * 10000 + b * 100 + c;
    }

    private long installedCode() throws Exception {
        PackageInfo p = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    private boolean allowedHost(String host) {
        return "github.com".equals(host) || "release-assets.githubusercontent.com".equals(host)
            || "objects.githubusercontent.com".equals(host) || "api.github.com".equals(host);
    }

    private HttpURLConnection connect(String address) throws Exception {
        URL url = new URL(address);
        for (int hops=0; hops<5; hops++) {
            if (!"https".equalsIgnoreCase(url.getProtocol()) || !allowedHost(url.getHost().toLowerCase(Locale.ROOT)))
                throw new SecurityException("Serveur de mise à jour non autorisé");
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setInstanceFollowRedirects(false);
            con.setConnectTimeout(12000);
            con.setReadTimeout(20000);
            con.setRequestProperty("User-Agent", "Goblin-Android-Updater");
            con.setRequestProperty("Accept", "application/vnd.github+json");
            int status = con.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = con.getHeaderField("Location");
                con.disconnect();
                if (location == null) throw new SecurityException("Redirection invalide");
                url = new URL(url, location);
                continue;
            }
            if (status != 200) {
                con.disconnect();
                throw new IllegalStateException("GitHub indisponible (HTTP " + status + ")");
            }
            return con;
        }
        throw new SecurityException("Trop de redirections");
    }

    private byte[] getBytes(String url, int limit) throws Exception {
        HttpURLConnection c = connect(url);
        try (InputStream input = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int n;
            while ((n = input.read(buffer)) != -1) {
                if (out.size() + n > limit) throw new IllegalStateException("Fichier trop volumineux");
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        } finally { c.disconnect(); }
    }


    /** Opt-in Android notification permission; never disables Play Protect or bypasses installation consent. */
    @JavascriptInterface public void enableUpdateNotifications() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7282);
            } else {
                event("notice","Les notifications de mise à jour sont autorisées.",null);
            }
        });
    }

    private void notifyAvailable(String version) {
        if (version == null || version.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        String previous = activity.getPreferences(Activity.MODE_PRIVATE).getString("last_notified_update", "");
        if (version.equals(previous)) return;
        activity.runOnUiThread(() -> {
            try {
                NotificationManager manager = (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
                if (manager == null) return;
                String channelId = "goblin_updates";
                if (Build.VERSION.SDK_INT >= 26) {
                    NotificationChannel channel = new NotificationChannel(channelId,
                        "Mises à jour de Goblin", NotificationManager.IMPORTANCE_DEFAULT);
                    channel.setDescription("Une notification quand une nouvelle version officielle est détectée");
                    manager.createNotificationChannel(channel);
                }
                Intent launch = new Intent(activity, MainActivity.class);
                launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent pending = PendingIntent.getActivity(activity, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ?
                    new Notification.Builder(activity, channelId) : new Notification.Builder(activity);
                Notification notice = builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("Mise à jour Goblin disponible")
                    .setContentText("Version " + version + " : ouvre Paramètres pour l'installer.")
                    .setContentIntent(pending).setAutoCancel(true).build();
                manager.notify(144, notice);
                activity.getPreferences(Activity.MODE_PRIVATE).edit()
                    .putString("last_notified_update", version).apply();
            } catch (Exception ignored) { }
        });
    }

    /** Immediate, opt-in native notification diagnostic, with no alarm scheduling. */
    @JavascriptInterface public void testNotification() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7282);
                event("notice", "Autorise les notifications, puis retouche Tester la notification.", null);
                return;
            }
            try {
                NotificationManager manager = (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
                if (manager == null || !manager.areNotificationsEnabled()) {
                    event("notice", "Les notifications de Goblin sont désactivées dans Android.", null);
                    return;
                }
                String channelId = "goblin_notification_test";
                if (Build.VERSION.SDK_INT >= 26) {
                    NotificationChannel channel = new NotificationChannel(channelId,
                        "Tests Goblin", NotificationManager.IMPORTANCE_DEFAULT);
                    channel.setDescription("Vérification manuelle des notifications système de Goblin");
                    manager.createNotificationChannel(channel);
                    if (manager.getNotificationChannel(channelId).getImportance() == NotificationManager.IMPORTANCE_NONE) {
                        event("notice", "Active le canal Tests Goblin dans les réglages des notifications Android.", null);
                        return;
                    }
                }
                Intent launch = new Intent(activity, MainActivity.class);
                launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent pending = PendingIntent.getActivity(activity, 91, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ?
                    new Notification.Builder(activity, channelId) : new Notification.Builder(activity);
                manager.notify(191, builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("Test Goblin")
                    .setContentText("Si tu vois ce message, les notifications Android fonctionnent.")
                    .setContentIntent(pending).setAutoCancel(true).build());
                event("notice", "Notification de test envoyée. Vérifie le panneau de notifications Android.", null);
            } catch (Exception e) {
                event("error", "Test de notification impossible : " + e.getMessage(), null);
            }
        });
    }

    @JavascriptInterface public void checkUpdates() {
        io.execute(() -> {
            try {
                JSONArray releases = new JSONArray(new String(getBytes(API, 600000), StandardCharsets.UTF_8));
                int best = (int) installedCode();
                String foundApk = null, foundSha = null, foundVersion = null;
                for (int i=0; i<releases.length(); i++) {
                    JSONObject release = releases.getJSONObject(i);
                    if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue;
                    String tag = release.optString("tag_name");
                    int candidate = codeForTag(tag);
                    if (candidate <= best) continue;
                    String ap = null, sha = null;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int a=0; a<assets.length(); a++) {
                        JSONObject asset = assets.getJSONObject(a);
                        String name = asset.optString("name"), link = asset.optString("browser_download_url");
                        String prefix = "https://github.com/" + REPO + "/releases/download/" + tag + "/";
                        if (!link.startsWith(prefix)) continue;
                        if ("LAtelierDuGoblin-Mobile.apk".equals(name)) ap=link;
                        if ("LAtelierDuGoblin-Mobile.apk.sha256".equals(name)) sha=link;
                    }
                    if (ap != null && sha != null) {
                        best=candidate; foundApk=ap;foundSha=sha;foundVersion=tag.substring("android-v".length());
                    }
                }
                if (foundApk == null) {
                    apkUrl=null;shaUrl=null;availableCode=0;availableVersion=null;
                    event("current","Goblin est à jour parmi les versions Android publiées.",null);
                } else {
                    apkUrl=foundApk;shaUrl=foundSha;availableCode=best;availableVersion=foundVersion;
                    event("available","Nouvelle version Android " + foundVersion + " disponible.",foundVersion);
                    notifyAvailable(foundVersion);
                }
            } catch (Exception e) {
                event("error","Vérification impossible : " + e.getMessage() + ". Ouvre les versions GitHub si nécessaire.",null);
            }
        });
    }

    private byte[] signer(File file, boolean archive) throws Exception {
        PackageManager pm = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo info = archive ? pm.getPackageArchiveInfo(file.getAbsolutePath(), flags)
            : pm.getPackageInfo(activity.getPackageName(), flags);
        if (info == null || !activity.getPackageName().equals(info.packageName))
            throw new SecurityException("Identifiant de l'application différent");
        android.content.pm.Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? info.signingInfo.getApkContentsSigners() : info.signatures;
        if (signatures == null || signatures.length != 1)
            throw new SecurityException("Signature Android ambiguë");
        return MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());
    }

    @JavascriptInterface public void installAvailable() {
        io.execute(() -> {
            try {
                String address=apkUrl, checksum=shaUrl, version=availableVersion;
                if (address == null || checksum == null || availableCode <= installedCode())
                    throw new IllegalStateException("Vérifie d'abord les mises à jour");
                event("downloading","Téléchargement de Goblin " + version + "…",version);
                String expected = new String(getBytes(checksum, 1024), StandardCharsets.UTF_8).trim().split("\\s+")[0];
                if (!expected.matches("[a-fA-F0-9]{64}")) throw new SecurityException("Somme SHA-256 invalide");
                File target = new File(new File(activity.getCacheDir(), "updates"), "Goblin-update.apk");
                File directory=target.getParentFile();
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cache indisponible");
                byte[] bytes=getBytes(address, 50000000);
                StringBuilder computed = new StringBuilder();
                for (byte b: MessageDigest.getInstance("SHA-256").digest(bytes))
                    computed.append(String.format(Locale.ROOT, "%02x", b & 255));
                if (!expected.equalsIgnoreCase(computed.toString()))
                    throw new SecurityException("APK non conforme à l'empreinte publiée");
                try(FileOutputStream out = new FileOutputStream(target)){out.write(bytes);}
                PackageInfo pkg=activity.getPackageManager().getPackageArchiveInfo(target.getAbsolutePath(),0);
                long newCode=pkg==null ? -1 : (Build.VERSION.SDK_INT>=28 ? pkg.getLongVersionCode() : pkg.versionCode);
                if (newCode <= installedCode() || newCode != availableCode)
                    throw new SecurityException("Version Android invalide");
                if (!Arrays.equals(signer(target,true), signer(target,false)))
                    throw new SecurityException("Certificat de signature différent. Mise à jour refusée.");
                activity.runOnUiThread(() -> {
                    event("ready","APK vérifiée. Confirme l'installation dans Android.",version);
                    if (Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                        event("permission","Autorise l'installation depuis Goblin, puis appuie à nouveau sur Installer.",version);
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:"+activity.getPackageName())));
                        return;
                    }
                    Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".files",target);
                    Intent intent=new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri,"application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(intent);
                });
            } catch (Exception e) {
                event("error","Installation non lancée : "+e.getMessage()+". Aucune donnée effacée.",null);
            }
        });
    }

    public void close() { io.shutdownNow(); }
}
