package app.openeir.client;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import android.webkit.CookieManager;

/**
 * OpenEirPushService — UnifiedPush 3.x delivery point.
 *
 * The server POSTs the same JSON contract it sends to web-push subscriptions
 * ({title, body, tag, url, kind}) to the user's distributor endpoint (usually
 * ntfy). The distributor forwards the bytes here; we render the notification
 * on the right channel: briefing → quiet, meds/nudge → default, SOS → high
 * with vibration and DND bypass.
 */
public class OpenEirPushService extends PushService {

    private static final String TAG = "OpenEirPush";

    @Override
    public void onNewEndpoint(@NonNull PushEndpoint endpoint, @NonNull String instance) {
        if (endpoint.getUrl() == null || endpoint.getUrl().isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences("openeir", MODE_PRIVATE);
        prefs.edit().putString("pushEndpoint", endpoint.getUrl()).apply();
        registerEndpointWithServer(prefs.getString("serverUrl", ""), endpoint.getUrl());
    }

    @Override
    public void onMessage(@NonNull PushMessage message, @NonNull String instance) {
        byte[] bytes = message.getContent();
        String raw = bytes != null ? new String(bytes, StandardCharsets.UTF_8) : "";
        String title = "OpenEir";
        String body = "";
        String kind = "info";
        String tag = null;
        String url = null;
        try {
            JSONObject json = new JSONObject(raw);
            title = json.optString("title", title);
            body = json.optString("body", "");
            kind = json.optString("kind", kind);
            tag = json.has("tag") && !json.isNull("tag") ? json.getString("tag") : null;
            url = json.has("url") && !json.isNull("url") ? json.getString("url") : null;
        } catch (Exception e) {
            // plain-text payload — display as-is
            body = raw;
        }
        showNotification(this, title, body, kind, tag, url);
    }

    @Override
    public void onRegistrationFailed(@NonNull FailedReason reason, @NonNull String instance) {
        Log.w(TAG, "UnifiedPush registration failed: " + reason);
        SharedPreferences prefs = getSharedPreferences("openeir", MODE_PRIVATE);
        prefs.edit().putString("pushLastError", "Registration failed: " + reason).apply();
    }

    @Override
    public void onUnregistered(@NonNull String instance) {
        getSharedPreferences("openeir", MODE_PRIVATE).edit().remove("pushEndpoint").apply();
    }

    private void registerEndpointWithServer(String serverUrl, String endpoint) {
        if (serverUrl == null || serverUrl.isEmpty()) return; // not paired yet; MainActivity re-registers on connect
        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(serverUrl + "/api/push/unified").openConnection();
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                conn.setDoOutput(true);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                String cookie = CookieManager.getInstance().getCookie(serverUrl);
                if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
                JSONObject payload = new JSONObject();
                payload.put("endpoint", endpoint);
                payload.put("appId", getPackageName());
                payload.put("label", android.os.Build.MODEL == null ? "Android device" : android.os.Build.MODEL);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                }
                int status = conn.getResponseCode();
                conn.disconnect();
                SharedPreferences prefs = getSharedPreferences("openeir", MODE_PRIVATE);
                if (status >= 200 && status < 300) {
                    prefs.edit().putLong("pushRegisteredAt", System.currentTimeMillis()).remove("pushLastError").apply();
                } else {
                    // most common case: 401 — the WebView session has not signed in yet;
                    // MainActivity retries on next open.
                    prefs.edit().putString("pushLastError", "Server returned HTTP " + status).apply();
                }
            } catch (IOException e) {
                getSharedPreferences("openeir", MODE_PRIVATE)
                    .edit().putString("pushLastError", e.getMessage() == null ? "network error" : e.getMessage()).apply();
            } catch (Exception e) {
                Log.w(TAG, "endpoint registration error", e);
            }
        }).start();
    }

    private void showNotification(Context ctx, String title, String body, String kind, String tag, String url) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        String view = extractView(url);
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (view != null) intent.putExtra(MainActivity.EXTRA_VIEW, view);

        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent content = PendingIntent.getActivity(ctx, url == null ? 0 : url.hashCode(), intent, flags);

        String channelId = "sos".equals(kind) ? "sos"
            : "briefing".equals(kind) ? "briefing"
            : "nudge".equals(kind) || "test".equals(kind) ? "meds"
            : "info";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(content)
            .setAutoCancel(true)
            .setPriority("sos".equals(kind) ? NotificationCompat.PRIORITY_MAX
                : "briefing".equals(kind) ? NotificationCompat.PRIORITY_LOW
                : NotificationCompat.PRIORITY_DEFAULT);

        if ("sos".equals(kind)) builder.setCategory(NotificationCompat.CATEGORY_ALARM);
        if (tag != null && !tag.isEmpty()) builder.setTag(tag);

        int id = (int) System.currentTimeMillis();
        nm.notify(tag == null || tag.isEmpty() ? "openeir" : tag, id, builder.build());
    }

    /** Map payload urls like "/?view=record" or "/#record" onto the view extra. */
    private String extractView(String url) {
        if (url == null || url.isEmpty()) return null;
        try {
            String u = url;
            int q = u.indexOf("?view=");
            if (q >= 0) {
                String v = u.substring(q + 6);
                int amp = v.indexOf('&');
                return amp >= 0 ? v.substring(0, amp) : v;
            }
            int h = u.indexOf("#");
            if (h >= 0) {
                String v = u.substring(h + 1);
                return v.startsWith("/") ? "" : v;
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
