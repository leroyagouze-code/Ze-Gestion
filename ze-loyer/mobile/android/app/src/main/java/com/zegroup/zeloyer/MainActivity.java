package com.zegroup.zeloyer;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ZE LOYER : ouvre le site ZE LOYER (voir capacitor.config.ts).
 *
 * Ajout par rapport à Capacitor : les quittances PDF et documents sont téléchargés avec
 * DownloadManager (la WebView Android ne sait pas afficher un PDF). La session de l'utilisateur
 * (cookie) est transmise, uniquement vers le serveur ZE LOYER lui-même.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "ZeLoyer";

    private static final Pattern FILENAME = Pattern.compile("filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> download(url, userAgent, contentDisposition, mimeType));

        // Bouton / geste « retour » d'Android : page précédente de ZE LOYER s'il y en a une, sinon on quitte
        // normalement. Enregistré en dernier, il passe avant les gestionnaires des plugins.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge().getWebView();
                boolean canGoBack = w.canGoBack();
                Log.i(TAG, "retour : canGoBack=" + canGoBack);
                if (canGoBack) {
                    w.goBack();
                } else {
                    // Première page : comportement standard d'Android (l'application passe en arrière-plan)
                    moveTaskToBack(true);
                }
            }
        });
    }

    /**
     * Anciens chemins de la touche retour (touche physique, versions d'Android où le rappel ci-dessus n'est
     * pas appelé) : même comportement.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && getBridge() != null) {
            WebView w = getBridge().getWebView();
            if (w != null && w.canGoBack()) {
                if (event.getAction() == KeyEvent.ACTION_UP) {
                    Log.i(TAG, "retour (touche) : page précédente");
                    w.goBack();
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void download(String url, String userAgent, String contentDisposition, String mimeType) {
        Uri uri = Uri.parse(url);
        String serverUrl = getBridge().getServerUrl();
        Uri server = serverUrl != null ? Uri.parse(serverUrl) : null;
        // Seulement depuis le serveur ZE LOYER lui-même (même protocole, même hôte, même port) :
        // le cookie de session ne part jamais ailleurs. Le serveur est toujours en HTTPS dans l'APK
        // distribué (scripts/configure.mjs refuse http, sauf version de test sur émulateur).
        if (
            server == null ||
            !String.valueOf(server.getScheme()).equals(uri.getScheme()) ||
            !String.valueOf(server.getHost()).equals(uri.getHost()) ||
            server.getPort() != uri.getPort()
        ) {
            Toast.makeText(this, "Téléchargement non autorisé", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            String fileName = fileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(fileName);
            request.setDescription("ZE LOYER");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ : dossier « Téléchargements », sans permission
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                // Android 7 à 9 : dossier de l'application (pas de permission de stockage à demander)
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(request);
            Toast.makeText(this, "Téléchargement : " + fileName + "\nOuvrez-le depuis la notification.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Téléchargement impossible. Réessayez.", Toast.LENGTH_LONG).show();
        }
    }

    private static String fileName(String url, String contentDisposition, String mimeType) {
        if (contentDisposition != null) {
            Matcher m = FILENAME.matcher(contentDisposition);
            if (m.find()) {
                String name = m.group(1).replaceAll("[\\\\/:*?\"<>|]", "_").trim();
                if (!name.isEmpty()) return name;
            }
        }
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }
}
