package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;

/**
 * Private local snapshots of the existing WebView localStorage. The first migration
 * snapshot is permanent and is made before the new JavaScript modifies any keys.
 * No network access, external storage permission or silent restore.
 * Uninstalling the application deletes this app-private directory: users should
 * still export an independent file for disaster recovery.
 */
public final class AutoBackupBridge {
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final int MAX_ROTATING = 12;
    private final File folder;
    AutoBackupBridge(Activity activity) {
        folder = new File(activity.getFilesDir(), "goblin-private-backups");
    }
    private boolean prepare() {
        return folder.isDirectory() || folder.mkdirs();
    }
    private static boolean allowedReason(String reason) {
        return "startup".equals(reason) || "background".equals(reason)
            || "pre-update".equals(reason) || "pre-restore".equals(reason)
            || "manual".equals(reason);
    }
    private File first() { return new File(folder, "original-before-first-upgrade.json"); }
    private File[] backups() {
        File[] all = folder.listFiles((dir, name) ->
            name.startsWith("snapshot-") && name.endsWith(".json"));
        if (all == null) return new File[0];
        Arrays.sort(all, Comparator.comparingLong(File::lastModified).reversed());
        return all;
    }
    private static byte[] read(File file) throws Exception {
        if (!file.isFile() || file.length() > MAX_BYTES) throw new IllegalStateException("Sauvegarde introuvable");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0, n;
            while (offset < bytes.length && (n = in.read(bytes, offset, bytes.length - offset)) > 0) offset += n;
            if (offset != bytes.length) throw new IllegalStateException("Sauvegarde incomplète");
            return bytes;
        }
    }
    private static boolean valid(String payload) {
        try {
            JSONObject json = new JSONObject(payload);
            JSONObject entries = json.optJSONObject("entries");
            return "goblin-localstorage-v1".equals(json.optString("format"))
                && entries != null && entries.length() > 0;
        } catch (Exception e) { return false; }
    }
    private boolean atomicWrite(File target, byte[] bytes) {
        File temp = new File(folder, target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(bytes); out.flush(); out.getFD().sync();
        } catch (Exception e) { temp.delete(); return false; }
        if (!temp.renameTo(target)) { temp.delete(); return false; }
        return true;
    }
    @JavascriptInterface public synchronized boolean snapshot(String payload, String reason) {
        if (!allowedReason(reason) || payload == null || payload.length() > MAX_BYTES) return false;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES || !valid(payload) || !prepare()) return false;
        // This remains untouched by retention cleanup or by later application launches.
        if (!first().exists() && !atomicWrite(first(), bytes)) return false;
        String name = "snapshot-" + System.currentTimeMillis() + "-" + reason + ".json";
        File target = new File(folder, name);
        if (!atomicWrite(target, bytes)) return false;
        File[] entries = backups();
        for (int i=MAX_ROTATING;i<entries.length;i++) entries[i].delete();
        return true;
    }
    @JavascriptInterface public synchronized String status() {
        JSONObject result = new JSONObject();
        try {
            File[] snapshots = backups();
            result.put("original", first().isFile());
            result.put("count", snapshots.length);
            result.put("latestAt", snapshots.length > 0 ? snapshots[0].lastModified() : 0);
            result.put("privateOnly", true);
        } catch (Exception ignored) {}
        return result.toString();
    }
    @JavascriptInterface public synchronized String latestSnapshot() {
        try {
            File[] entries = backups();
            File latest = entries.length > 0 ? entries[0] : first();
            String json = new String(read(latest), StandardCharsets.UTF_8);
            return valid(json) ? json : "";
        } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public synchronized String originalSnapshot() {
        try {
            String json = new String(read(first()), StandardCharsets.UTF_8);
            return valid(json) ? json : "";
        } catch (Exception e) { return ""; }
    }
}
