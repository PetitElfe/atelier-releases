package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.window.OnBackInvokedDispatcher;
import android.window.OnBackInvokedCallback;
import android.widget.FrameLayout;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {
    private WebView webView;
    private TailnetBridge tailnet;
    private UpdateBridge updateBridge;
    private String pendingBackup;
    private static final int BACKUP_REQUEST=7281;
    private boolean nativeBackRegistered = false;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(36, 55, 45));
        getWindow().setNavigationBarColor(Color.rgb(25, 43, 34));
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView = new WebView(this);
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        updateBridge = new UpdateBridge(this, webView);
        webView.addJavascriptInterface(updateBridge, "AtelierUpdates");
        tailnet = new TailnetBridge(this, webView);
        webView.addJavascriptInterface(tailnet, "AtelierTailnet");
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public void exportBackup(String json) {
                if(json==null || json.length()>1000000)return;
                runOnUiThread(()->{
                    pendingBackup=json;
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE,"atelier-goblin-sauvegarde.json");
                    startActivityForResult(intent,BACKUP_REQUEST);
                });
            }
        }, "AtelierBackup");
        // Android 15+ draws apps beneath system bars even when targeting SDK 35.
        // Keep the WebView in a safe content area instead of overlapping the clock.
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(36, 55, 45));
        frame.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                top = insets.getInsets(WindowInsets.Type.statusBars()).top;
                bottom = 0; // Navigation controls are hidden; WebView gets the full usable height.
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = 0;
            }
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
            if (params.topMargin != top || params.bottomMargin != bottom) {
                params.topMargin = top;
                params.bottomMargin = bottom;
                webView.setLayoutParams(params);
            }
            return insets;
        });
        setContentView(frame);
        frame.requestApplyInsets();
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                () -> dispatchBackToWeb());
            nativeBackRegistered = true;
        }
    }
    private void dispatchBackToWeb() {
        if (webView == null) { moveTaskToBack(true); return; }
        webView.evaluateJavascript(
            "(window.__atelierHandleAndroidBack ? window.__atelierHandleAndroidBack() : 'exit')",
            result -> {
                if (result == null || "\"exit\"".equals(result)) moveTaskToBack(true);
            });
    }
    @Override public void onBackPressed() {
        dispatchBackToWeb();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==BACKUP_REQUEST){
            boolean success=false;
            if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null&&pendingBackup!=null){
                try(OutputStream out=getContentResolver().openOutputStream(data.getData())){
                    if(out!=null){out.write(pendingBackup.getBytes(StandardCharsets.UTF_8));success=true;}
                }catch(Exception ignored){}
            }
            pendingBackup=null;
            if(webView!=null)webView.evaluateJavascript("window.__atelierBackupComplete&&window.__atelierBackupComplete("+success+")",null);
        }
    }
    @Override protected void onResume() {
        super.onResume();
        // On returning from the background, refresh remote PC lists only.
        // Existing local WebView data and the offline journal remain untouched.
        if (webView != null) webView.evaluateJavascript(
            "window.__atelierOnResume&&window.__atelierOnResume()", null);
    }
    @Override protected void onDestroy() {
        if (tailnet != null) tailnet.close();
        if (updateBridge != null) updateBridge.close();
        webView.destroy();
        super.onDestroy();
    }
}