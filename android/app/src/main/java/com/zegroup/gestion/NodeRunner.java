package com.zegroup.gestion;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Installe l'application Node (assets/app.zip) puis lance Node une seule fois par processus. */
final class NodeRunner {
    private static final String TAG = "ZEGestion";
    private static boolean started = false;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private static native int startNode(String[] arguments);

    interface Progress {
        void step(String message);
    }

    static File dataDir(Context ctx) {
        return new File(ctx.getFilesDir(), "data");
    }

    static File readyFile(Context ctx) {
        return new File(dataDir(ctx), "ready.json");
    }

    static synchronized boolean isStarted() {
        return started;
    }

    /** À appeler hors du fil de l'interface : décompresse si l'appli a changé, puis lance Node (ne rend jamais la main). */
    static void start(Context ctx, Progress progress) throws IOException {
        synchronized (NodeRunner.class) {
            if (started) return;
            started = true;
        }
        File project = new File(ctx.getFilesDir(), "nodejs-project");
        File marker = new File(ctx.getFilesDir(), "app.version");
        String wanted = readAsset(ctx.getAssets(), "app.version");
        String installed = marker.exists() ? readFile(marker) : "";
        if (!wanted.equals(installed) || !new File(project, "main.cjs").exists()) {
            progress.step("Installation de l'application…");
            deleteTree(project);
            unzip(ctx.getAssets(), "app.zip", project);
            try (OutputStream o = new FileOutputStream(marker)) {
                o.write(wanted.getBytes(StandardCharsets.UTF_8));
            }
        }
        File data = dataDir(ctx);
        //noinspection ResultOfMethodCallIgnored
        data.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        readyFile(ctx).delete();
        progress.step("Démarrage…");
        Log.i(TAG, "Lancement de Node");
        int code = startNode(new String[] {"node", new File(project, "main.cjs").getAbsolutePath(), data.getAbsolutePath()});
        Log.e(TAG, "Node s'est arrêté, code " + code);
    }

    private static void unzip(AssetManager assets, String name, File dest) throws IOException {
        byte[] buf = new byte[1 << 16];
        String root = dest.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(assets.open(name))) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                File f = new File(dest, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) throw new IOException("Entrée invalide : " + e.getName());
                if (e.isDirectory()) {
                    //noinspection ResultOfMethodCallIgnored
                    f.mkdirs();
                    continue;
                }
                //noinspection ResultOfMethodCallIgnored
                f.getParentFile().mkdirs();
                try (OutputStream out = new BufferedOutputStream(new FileOutputStream(f), buf.length)) {
                    int n;
                    while ((n = zip.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
    }

    private static void deleteTree(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteTree(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static String readAsset(AssetManager assets, String name) throws IOException {
        try (InputStream in = assets.open(name)) {
            return new String(readAll(in), StandardCharsets.UTF_8).trim();
        }
    }

    static String readFile(File f) throws IOException {
        try (InputStream in = new java.io.FileInputStream(f)) {
            return new String(readAll(in), StandardCharsets.UTF_8).trim();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }
}
