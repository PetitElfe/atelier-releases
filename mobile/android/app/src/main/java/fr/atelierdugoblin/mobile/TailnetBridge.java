package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.net.URL;
import java.net.HttpURLConnection;
import java.net.URI;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Only the bundled, trusted WebView HTML calls this HTTPS tailnet bridge. */
public final class TailnetBridge {
    private final Activity activity;
    private final WebView view;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    TailnetBridge(Activity activity, WebView view) {
        this.activity = activity; this.view = view;
    }

    private boolean allowed(String base, String path, String method) {
        try {
            URI uri = new URI(base);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null ||
                !host.toLowerCase().endsWith(".ts.net") ||
                host.length() <= ".ts.net".length() ||
                uri.getPort() != -1 && uri.getPort() != 443 ||
                uri.getRawUserInfo() != null || uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !"/".equals(uri.getRawPath()) ||
                uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
            if (!method.equals("GET") && !method.equals("POST") && !method.equals("PUT")) return false;
            if (path.contains("..") || path.contains("//") || path.contains("#")) return false;
            if (method.equals("GET")) return path.equals("/api/tasks") || path.equals("/api/shopping") ||
                path.equals("/api/mobile/notes") || path.equals("/api/recipes") ||
                path.matches("^/api/events\\?start=[0-9]{4}-[0-9]{2}-[0-9]{2}&end=[0-9]{4}-[0-9]{2}-[0-9]{2}$");
            if (method.equals("POST")) return path.equals("/api/tasks") || path.equals("/api/shopping") ||
                path.equals("/api/mobile/notes") || path.equals("/api/events");
            return path.matches("^/api/(tasks|shopping)/[0-9]+$");
        } catch (Exception e) { return false; }
    }

    private static String readBounded(InputStream stream) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int n;
            while ((n = input.read(buf)) != -1) {
                if (out.size() + n > 2000000) throw new IllegalStateException("Réponse trop grande");
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        }
    }

    @JavascriptInterface
    public void request(String id, String base, String method, String path, String body) {
        if (id == null || id.length() > 80 || !allowed(base,path,method)) {
            respond(id, 0, "{\"error\":\"Adresse ou requête non autorisée\"}");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection conn = null;
            int status = 0;
            String response;
            try {
                URL url = new URL(base.replaceAll("/+$","") + path);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(9000);
                conn.setRequestMethod(method);
                conn.setRequestProperty("Accept", "application/json");
                if (!method.equals("GET")) {
                    byte[] bytes = (body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > 250000) throw new IllegalArgumentException("Données trop volumineuses");
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
                }
                status = conn.getResponseCode();
                if (status >= 300 && status < 400) throw new IllegalStateException("Redirection refusée");
                InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                response = stream == null ? "{}" : readBounded(stream);
            } catch (Exception e) {
                response = new JSONObject().put("error", e.getClass().getSimpleName() + " : " + e.getMessage()).toString();
            } finally {
                if (conn != null) conn.disconnect();
            }
            respond(id, status, response);
        });
    }

    private void respond(String id, int status, String response) {
        final String script = "window.__atelierSyncResponse&&window.__atelierSyncResponse(" +
            JSONObject.quote(id == null ? "" : id) + "," + status + "," +
            JSONObject.quote(response) + ");";
        activity.runOnUiThread(() -> view.evaluateJavascript(script, null));
    }

    public void close() { executor.shutdownNow(); }
}
