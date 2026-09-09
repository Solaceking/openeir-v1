package app.openeir.client;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.CookieManager;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.FileProvider;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.unifiedpush.android.connector.UnifiedPush;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * OpenEirBridge — the native surface of the companion shell.
 *
 * Security model:
 *  - The only origin ever loaded into the WebView is the one the user entered
 *    here and that passed validate() (native HTTP check, no CORS in the way).
 *  - HTTPS is enforced unless the user explicitly opted in to plain HTTP for a
 *    trusted LAN address (the toggle on the onboarding screen).
 *  - allowNavigation "*" in capacitor.config.ts is what lets the bridge inject
 *    into the user's own origin; every other origin loads in the system browser.
 */
@CapacitorPlugin(name = "OpenEirBridge")
public class OpenEirBridge extends Plugin {

    private static final String PREFS = "openeir";
    private static final String KEY_URL = "serverUrl";
    private static final String KEY_ALLOW_HTTP = "allowHttp";
    private static final String KEY_LOCK_ENABLED = "lockEnabled";
    private static final String KEY_LOCK_TIMEOUT_MIN = "lockTimeoutMin";
    private static final String KEY_PUSH_ENDPOINT = "pushEndpoint";
    private static final int MAX_SHARE_BYTES = 8 * 1024 * 1024;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String getServerUrl() {
        return prefs().getString(KEY_URL, null);
    }

    boolean allowHttp() {
        return prefs().getBoolean(KEY_ALLOW_HTTP, false);
    }

    // ---------- server pairing ----------

    @PluginMethod
    public void getServer(PluginCall call) {
        JSObject ret = new JSObject();
        String url = getServerUrl();
        ret.put("url", url == null ? "" : url);
        ret.put("allowHttp", allowHttp());
        call.resolve(ret);
    }

    @PluginMethod
    public void validate(final PluginCall call) {
        final String url = call.getString("url", "");
        final boolean allowHttp = call.getBoolean("allowHttp", false);
        Executors.newSingleThreadExecutor().execute(() -> {
            JSObject ret = new JSObject();
            try {
                if (!url.startsWith("https://") && !(allowHttp && url.startsWith("http://"))) {
                    ret.put("ok", false);
                    ret.put("error", "Only https:// addresses are allowed (or http on a trusted LAN)");
                    call.resolve(ret);
                    return;
                }
                HttpURLConnection conn = (HttpURLConnection) new URL(url + "/api/auth/status").openConnection();
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                conn.setRequestProperty("Accept", "application/json");
                int status = conn.getResponseCode();
                String body = readAll(conn);
                conn.disconnect();
                if (status == 200 && body != null && body.contains("mode")) {
                    ret.put("ok", true);
                    ret.put("mode", extractJsonString(body, "mode"));
                } else {
                    ret.put("ok", false);
                    ret.put("error", "HTTP " + status);
                }
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void connect(final PluginCall call) {
        final String url = call.getString("url", "");
        final boolean allowHttp = call.getBoolean("allowHttp", false);
        if (!url.startsWith("https://") && !(allowHttp && url.startsWith("http://"))) {
            call.reject("Only https:// addresses are allowed (or http on a trusted LAN)");
            return;
        }
        prefs().edit().putString(KEY_URL, url).putBoolean(KEY_ALLOW_HTTP, allowHttp).apply();
        getActivity().runOnUiThread(() -> {
            bridge.getWebView().loadUrl(url);
            call.resolve();
        });
        // pair native push as soon as a server is known (best effort)
        registerPushQuietly();
        MainActivity.scheduleWork(getActivity().getApplicationContext());
    }
    @PluginMethod
    public void disconnect(final PluginCall call) {
        prefs().edit().clear().apply();
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        UnifiedPush.unregisterApp(getActivity(), "");
        getActivity().runOnUiThread(() -> {
            bridge.getWebView().loadUrl(bridge.getLocalUrl());
            call.resolve();
        });
    }

    // ---------- native share (out) ----------

    @PluginMethod
    public void shareFile(PluginCall call) {
        String data = call.getString("data", "");
        String mime = call.getString("mime", "application/pdf");
        String name = call.getString("fileName", "openeir.pdf");
        if (data.isEmpty()) {
            call.reject("Missing data");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            String safeName = name.replaceAll("[^A-Za-z0-9._-]", "_");
            File file = new File(dir, safeName);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Context ctx = getContext();
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Could not share file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "");
        if (text.isEmpty()) {
            call.reject("Missing text");
            return;
        }
        Context ctx = getContext();
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        Intent chooser = Intent.createChooser(send, null);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(chooser);
        call.resolve();
    }

    // ---------- print-to-PDF ----------

    @PluginMethod
    public void printPage(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        PrintDocumentAdapter adapter = bridge.getWebView().createPrintDocumentAdapter("openeir-report");
        pm.print("OpenEir Report", adapter, new PrintAttributes.Builder().build());
        call.resolve();
    }

    // ---------- haptics ----------

    @PluginMethod
    public void haptic(PluginCall call) {
        String style = call.getString("style", "light");
        Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) {
            call.resolve();
            return;
        }
        long timing = "heavy".equals(style) ? 40 : "success".equals(style) ? 18 : 12;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(timing, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            v.vibrate(timing);
        }
        call.resolve();
    }

    // ---------- biometric app lock ----------

    @PluginMethod
    public void appLockGet(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", prefs().getBoolean(KEY_LOCK_ENABLED, false));
        ret.put("timeoutMin", prefs().getInt(KEY_LOCK_TIMEOUT_MIN, 1));
        ret.put("available", biometricAvailable());
        call.resolve(ret);
    }

    @PluginMethod
    public void appLockSet(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        int timeoutMin = call.getInt("timeoutMin", 1);
        if (enabled && !biometricAvailable()) {
            call.reject("No biometric hardware or screen lock enrolled on this device");
            return;
        }
        prefs().edit().putBoolean(KEY_LOCK_ENABLED, enabled).putInt(KEY_LOCK_TIMEOUT_MIN, timeoutMin).apply();
        call.resolve();
    }

    private boolean biometricAvailable() {
        BiometricManager bm = BiometricManager.from(getContext());
        int can = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        return can == BiometricManager.BIOMETRIC_SUCCESS;
    }

    /** Prompt now — used by the lock gate and callable from the web app. */
    @PluginMethod
    public void biometricCheck(PluginCall call) {
        String reason = call.getString("reason", "Unlock OpenEir");
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        Executor executor = Executors.newSingleThreadExecutor();
        BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("error", errString.toString());
                call.resolve(ret);
            }
        });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("OpenEir")
            .setSubtitle(reason)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build();
        prompt.authenticate(info);
    }

    // ---------- native push (UnifiedPush) ----------

    @PluginMethod
    public void pushStatus(PluginCall call) {
        JSObject ret = new JSObject();
        Context ctx = getContext();
        java.util.List<String> distributors = UnifiedPush.getDistributors(ctx);
        ret.put("distributor", UnifiedPush.getSavedDistributor(ctx));
        ret.put("distributorCount", distributors.size());
        ret.put("endpoint", prefs().getString(KEY_PUSH_ENDPOINT, ""));
        call.resolve(ret);
    }

    @PluginMethod
    public void pushRegister(PluginCall call) {
        Context ctx = getContext();
        java.util.List<String> distributors = UnifiedPush.getDistributors(ctx);
        if (distributors.isEmpty()) {
            call.reject("No UnifiedPush distributor found — install ntfy (F-Droid or Play), open it once, then retry.");
            return;
        }
        if (UnifiedPush.getSavedDistributor(ctx) == null) {
            UnifiedPush.saveDistributor(ctx, distributors.get(0));
        }
        // registerApp is the Java-interop entry point (the 3.x register() takes
        // an optional KeyManager parameter that has no sensible Java default)
        UnifiedPush.registerApp(ctx, "", null, null);
        call.resolve();
    }

    @PluginMethod
    public void pushUnregister(PluginCall call) {
        UnifiedPush.unregisterApp(getActivity(), "");
        prefs().edit().remove(KEY_PUSH_ENDPOINT).apply();
        call.resolve();
    }

    void savePushEndpoint(String endpoint) {
        prefs().edit().putString(KEY_PUSH_ENDPOINT, endpoint).apply();
    }

    void registerPushQuietly() {
        Context ctx = getContext();
        if (UnifiedPush.getSavedDistributor(ctx) != null) {
            UnifiedPush.registerApp(ctx, "", null, null);
        }
    }

    // ---------- shared http helper (used by MainActivity for share uploads) ----------

    String postMultipartToServer(String serverUrl, String fieldName, String fileName, String mime, byte[] bytes) throws IOException {
        String boundary = "----openeir" + System.currentTimeMillis();
        HttpURLConnection conn = (HttpURLConnection) new URL(serverUrl + "/api/ocr/scan").openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setDoOutput(true);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        String cookie = CookieManager.getInstance().getCookie(serverUrl);
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);

        try (ByteArrayOutputStream body = new ByteArrayOutputStream()) {
            body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(("Content-Disposition: form-data; name=\"" + fieldName + "\"; filename=\"" + fileName + "\"\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(("Content-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(bytes);
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            try (var out = conn.getOutputStream()) {
                out.write(body.toByteArray());
            }
        }
        int status = conn.getResponseCode();
        String response = readAll(conn);
        conn.disconnect();
        if (status >= 200 && status < 300) {
            return response;
        }
        throw new IOException("Upload failed (HTTP " + status + ")");
    }

    // ---------- helpers ----------

    private String readAll(HttpURLConnection conn) throws IOException {
        try {
            InputStream in = conn.getResponseCode() < 400 ? conn.getInputStream() : conn.getErrorStream();
            if (in == null) return null;
            try (ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[4096];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                return buf.toString("UTF-8");
            }
        } catch (IOException e) {
            return null;
        }
    }

    private String extractJsonString(String body, String key) {
        try {
            int i = body.indexOf("\"" + key + "\"");
            if (i < 0) return "";
            int colon = body.indexOf(':', i);
            int q1 = body.indexOf('"', colon);
            int q2 = body.indexOf('"', q1 + 1);
            return body.substring(q1 + 1, q2);
        } catch (Exception e) {
            return "";
        }
    }
}
