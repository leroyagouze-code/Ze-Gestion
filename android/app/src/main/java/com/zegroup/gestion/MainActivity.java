package com.zegroup.gestion;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Fenêtre de l'appli : écran de démarrage, puis ZE Gestion servi en local par Node. */
public class MainActivity extends Activity {
    private static final String TAG = "ZEGestion";
    private static final int PICK_FILE = 1;
    private WebView web;
    private String appUrl;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "ZEAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (isLocal(u)) return false;
                // WhatsApp, achat de licence sur le serveur, téléphone… : applis du téléphone
                openExternal(u);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // window.print() ne fait rien dans une WebView : impression Android à la place
                view.evaluateJavascript("window.print = function () { ZEAndroid.print(document.title || 'ZE Gestion'); };", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        // Factures et tickets (PDF) : enregistrés puis ouverts dans le lecteur PDF du téléphone
        web.setDownloadListener((url, userAgent, disposition, mime, length) ->
                new Thread(() -> download(url, disposition, mime)).start());
        setContentView(web);

        if (state != null) web.restoreState(state);
        if (NodeRunner.isStarted() && NodeRunner.readyFile(this).exists()) {
            waitForServer();
            return;
        }
        web.loadUrl("file:///android_asset/splash.html");
        if (!NodeRunner.isStarted()) {
            new Thread(() -> {
                try {
                    NodeRunner.start(getApplicationContext(), this::splash);
                } catch (Throwable e) {
                    Log.e(TAG, "Démarrage impossible", e);
                    fail("Démarrage impossible : " + e.getMessage());
                }
            }, "node").start();
        }
        waitForServer();
    }

    private void waitForServer() {
        new Thread(() -> {
            File ready = NodeRunner.readyFile(this);
            long start = System.currentTimeMillis();
            while (System.currentTimeMillis() - start < 300_000) {
                if (ready.exists()) {
                    try {
                        JSONObject o = new JSONObject(NodeRunner.readFile(ready));
                        if (o.has("error")) {
                            fail(o.getString("error"));
                        } else {
                            String url = o.getString("url");
                            ui.post(() -> {
                                appUrl = url;
                                String current = web.getUrl();
                                if (current == null || !current.startsWith(url)) web.loadUrl(url + "/dashboard");
                            });
                        }
                        return;
                    } catch (Exception ignored) {
                        // fichier en cours d'écriture
                    }
                }
                try {
                    Thread.sleep(300);
                } catch (InterruptedException e) {
                    return;
                }
            }
            fail("L'application met trop de temps à démarrer. Fermez-la et rouvrez-la.");
        }).start();
    }

    private void splash(String message) {
        ui.post(() -> web.evaluateJavascript("window.setStep && setStep(" + JSONObject.quote(message) + ")", null));
    }

    private void fail(String message) {
        ui.post(() -> web.evaluateJavascript("window.setError && setError(" + JSONObject.quote(message) + ")", null));
    }

    private boolean isLocal(Uri u) {
        String host = u.getHost();
        return "file".equals(u.getScheme()) || "localhost".equals(host) || "127.0.0.1".equals(host);
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucune application pour ouvrir ce lien", Toast.LENGTH_SHORT).show();
        }
    }

    private void download(String url, String disposition, String mime) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            String name = URLUtil.guessFileName(url, c.getHeaderField("Content-Disposition") != null ? c.getHeaderField("Content-Disposition") : disposition, mime);
            File dir = new File(getCacheDir(), "documents");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File f = new File(dir, name);
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            String type = c.getContentType() != null ? c.getContentType().split(";")[0] : mime;
            Uri uri = DocumentProvider.uriFor(f);
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ui.post(() -> {
                try {
                    startActivity(Intent.createChooser(view, name));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(this, "Installez un lecteur PDF pour ouvrir " + name, Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Téléchargement impossible", e);
            ui.post(() -> Toast.makeText(this, "Téléchargement impossible", Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private class Bridge {
        @JavascriptInterface
        public void print(String title) {
            ui.post(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                pm.print(title, web.createPrintDocumentAdapter(title), new PrintAttributes.Builder().build());
            });
        }
    }
}
