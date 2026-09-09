package app.openeir.client;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * OpenEir — main activity.
 *
 * Loads the bundled onboarding shell when no server is paired; once paired,
 * every launch goes straight to the user's own OpenEir instance. Adds three
 * native behaviours on top of the web app:
 *  - Biometric app lock: an opaque gate whenever the app returns from
 *    background after the configured idle timeout (health data on a phone).
 *  - Share Target: an image shared from any app is uploaded straight into
 *    {server}/api/ocr/scan with the WebView session cookies, then the app
 *    opens on the readings view.
 *  - Shortcuts & notifications deep links via the `openeir.view` extra.
 */
public class MainActivity extends BridgeActivity {

    public static final String EXTRA_VIEW = "openeir.view";
    private static final int REQ_NOTIFICATIONS = 4001;

    private OpenEirBridge bridgePlugin;
    private FrameLayout lockOverlay;
    private boolean locked = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin registration must happen before the bridge initializes
        registerPlugin(OpenEirBridge.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        PluginHandle handle = bridge.getPlugin("OpenEirBridge");
        bridgePlugin = handle != null ? (OpenEirBridge) handle.getInstance() : null;
        ensureLockOverlay();
        requestNotificationPermissionIfNeeded();
        handleIntent(getIntent());
        // paired? jump straight to the user's own instance instead of the shell
        String server = bridgePlugin != null ? bridgePlugin.getServerUrl() : null;
        if (server != null && !server.isEmpty()) {
            String view = getIntent() != null ? getIntent().getStringExtra(EXTRA_VIEW) : null;
            final String target = view != null && !view.isEmpty() ? server + "/?view=" + Uri.encode(view) : server;
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));
        }
        MainActivity.scheduleWork(getApplicationContext());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction()) && intent.getType() != null && intent.getType().startsWith("image/")) {
            handleShareImage(intent);
            return;
        }
        String view = intent.getStringExtra(EXTRA_VIEW);
        String server = bridgePlugin != null ? bridgePlugin.getServerUrl() : null;
        if (view != null && !view.isEmpty() && server != null && !server.isEmpty() && bridge != null) {
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(server + "/?view=" + Uri.encode(view)));
        }
    }

    // ---------- Share Target → OCR ----------

    private void handleShareImage(Intent intent) {
        final String server = bridgePlugin != null ? bridgePlugin.getServerUrl() : null;
        if (server == null || server.isEmpty()) return; // nothing paired yet — ignore
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                byte[] bytes = readBytes(getContentResolver(), uri);
                if (bytes == null || bytes.length == 0) throw new IOException("Empty image");
                String mime = intent.getType() == null ? "image/jpeg" : intent.getType();
                bridgePlugin.postMultipartToServer(server, "image", "shared.jpg", mime, bytes);
                runOnUiThread(() -> {
                    android.widget.Toast.makeText(this, "Image sent to OpenEir OCR", android.widget.Toast.LENGTH_SHORT).show();
                    bridge.getWebView().loadUrl(server + "/?view=readings");
                });
            } catch (Exception e) {
                runOnUiThread(() -> android.widget.Toast
                    .makeText(this, "Could not send image: " + e.getMessage(), android.widget.Toast.LENGTH_LONG)
                    .show());
            }
        });
    }

    private byte[] readBytes(android.content.ContentResolver resolver, Uri uri) throws IOException {
        try (InputStream in = resolver.openInputStream(uri); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toByteArray();
        }
    }

    // ---------- biometric app lock ----------

    private void ensureLockOverlay() {
        lockOverlay = new FrameLayout(this);
        lockOverlay.setBackgroundColor(Color.parseColor("#f7f2e9"));
        lockOverlay.setVisibility(android.view.View.GONE);
        lockOverlay.setClickable(true);
        lockOverlay.setFocusable(true);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams boxLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        lockOverlay.addView(box, boxLp);

        TextView title = new TextView(this);
        title.setText("OpenEir is locked");
        title.setTextSize(22);
        title.setTextColor(Color.parseColor("#292524"));
        title.setGravity(Gravity.CENTER);

        TextView hint = new TextView(this);
        hint.setText("Verify it's you to continue");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#78716c"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(8), 0, dp(20));

        Button unlock = new Button(this);
        unlock.setText("Unlock");
        unlock.setTextColor(Color.WHITE);
        unlock.setBackgroundColor(Color.parseColor("#0f766e"));
        unlock.setOnClickListener(v -> showBiometricPrompt());

        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        box.addView(title, tl);
        box.addView(hint, tl);
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(dp(220), dp(48));
        bl.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(unlock, bl);

        // add on top of everything Capacitor renders
        ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
        if (root != null) root.addView(lockOverlay, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void lockNow() {
        if (locked) return;
        locked = true;
        lockOverlay.post(() -> {
            lockOverlay.setVisibility(android.view.View.VISIBLE);
            showBiometricPrompt();
        });
    }

    private void unlockDone() {
        locked = false;
        lockOverlay.post(() -> lockOverlay.setVisibility(android.view.View.GONE));
    }

    private void showBiometricPrompt() {
        FragmentActivity activity = this;
        BiometricManager bm = BiometricManager.from(this);
        int can = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            // No usable authenticator — fail open rather than lock the user out.
            unlockDone();
            return;
        }
        Executor executor = Executors.newSingleThreadExecutor();
        BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                unlockDone();
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                // stay locked; the Unlock button allows retrying
            }
        });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("OpenEir")
            .setSubtitle("Verify it's you to continue")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build();
        prompt.authenticate(info);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean lockEnabled() {
        return getSharedPreferences("openeir", Context.MODE_PRIVATE).getBoolean("lockEnabled", false);
    }

    private int lockTimeoutMin() {
        return getSharedPreferences("openeir", Context.MODE_PRIVATE).getInt("lockTimeoutMin", 1);
    }

    @Override
    public void onStop() {
        super.onStop();
        if (lockEnabled()) {
            getSharedPreferences("openeir", Context.MODE_PRIVATE)
                .edit().putLong("lastPauseAt", System.currentTimeMillis()).apply();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (lockEnabled()) {
            long last = getSharedPreferences("openeir", Context.MODE_PRIVATE).getLong("lastPauseAt", 0);
            long elapsed = last == 0 ? 0 : System.currentTimeMillis() - last;
            if (elapsed >= lockTimeoutMin() * 60_000L) {
                lockNow();
            }
        }
    }

    // ---------- misc ----------

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel("briefing", getString(R.string.channel_briefing), NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel("meds", getString(R.string.channel_meds), NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel sos = new NotificationChannel("sos", getString(R.string.channel_sos), NotificationManager.IMPORTANCE_HIGH);
        sos.enableVibration(true);
        sos.setBypassDnd(true);
        nm.createNotificationChannel(sos);
        nm.createNotificationChannel(new NotificationChannel("info", getString(R.string.channel_info), NotificationManager.IMPORTANCE_DEFAULT));
    }

    /** Hook for future background work; currently a no-op placeholder kept explicit. */
    static void scheduleWork(Context context) {
        // reserved for periodic sync; nothing scheduled in v1.0
    }

    @Override
    public void onBackPressed() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null && webView.canGoBack() && !webView.getUrl().equals(bridgePlugin != null ? bridgePlugin.getServerUrl() : null)) {
            // let in-app back navigation work (e.g. report pages)
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @SuppressLint("MissingPermission")
    void noopVibrate() {
        // placeholder to keep imports tidy if vibrators are removed later
    }
}
