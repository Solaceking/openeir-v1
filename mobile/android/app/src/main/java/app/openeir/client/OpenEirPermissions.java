package app.openeir.client;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.HashSet;
import java.util.Set;

/**
 * OpenEirPermissions — one honest surface for the app's runtime permissions.
 *
 * Why this exists: the WebView grants getUserMedia by auto-requesting the
 * manifest permissions (BridgeWebChromeClient), but a user who denied once —
 * or wants to check later — had no way to see or fix the state from inside
 * the app. This plugin gives the web app (Settings → App permissions) and the
 * onboarding shell a single source of truth:
 *
 *   status()        → { microphone|camera|location|notifications:
 *                        "granted" | "denied" | "prompt" | "blocked" }
 *   request({permissions: [...]}) → system dialog for the listed aliases,
 *                        resolves with the same status map afterwards.
 *   openSettings()  → Android Settings → Apps → OpenEir (for "blocked",
 *                        where the system dialog can no longer be shown).
 *
 * State semantics (deliberately user-facing, not android-precise):
 *   granted  — all permissions of the alias are granted
 *   denied   — user said no at least once, Android will still show the dialog
 *   prompt   — never asked
 *   blocked  — Android will no longer show a dialog ("don't ask again" or two
 *              denials); only Settings can change this.
 */
@CapacitorPlugin(name = "OpenEirPermissions", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
    @Permission(alias = "location", strings = {
        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class OpenEirPermissions extends Plugin {

    private static final String[] ALIASES = { "microphone", "camera", "location", "notifications" };
    private static final String KEY_ASKED = "permAskedOnce";

    private android.content.SharedPreferences prefs() {
        return getContext().getSharedPreferences("openeir", Context.MODE_PRIVATE);
    }

    private String[] permsFor(String alias) {
        switch (alias) {
            case "microphone": return new String[]{ Manifest.permission.RECORD_AUDIO };
            case "camera": return new String[]{ Manifest.permission.CAMERA };
            case "location": return new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION };
            case "notifications": return new String[]{ Manifest.permission.POST_NOTIFICATIONS };
            default: return new String[]{};
        }
    }

    private boolean granted(String perm) {
        Context ctx = getContext();
        // POST_NOTIFICATIONS only exists as a runtime permission on Android 13+;
        // below that notifications are on by default, so report granted.
        if (perm.equals(Manifest.permission.POST_NOTIFICATIONS) && Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }

    private String statusFor(String alias) {
        String[] perms = permsFor(alias);
        boolean allGranted = true;
        boolean askableAgain = false;
        for (String p : perms) {
            if (granted(p)) continue;
            allGranted = false;
            Activity act = getActivity();
            if (act != null && androidx.core.app.ActivityCompat
                    .shouldShowRequestPermissionRationale(act, p)) {
                askableAgain = true; // denied recently — the dialog will still appear
            }
        }
        if (allGranted) return "granted";
        if (askableAgain) return "denied";
        Set<String> asked = prefs().getStringSet(KEY_ASKED, new HashSet<>());
        return asked.contains(alias) ? "blocked" : "prompt";
    }

    private JSObject statusAll() {
        JSObject ret = new JSObject();
        for (String alias : ALIASES) ret.put(alias, statusFor(alias));
        return ret;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusAll());
    }

    @PluginMethod
    public void request(PluginCall call) {
        JSArray wanted = call.getArray("permissions");
        java.util.List<String> toAsk = new java.util.ArrayList<>();
        java.util.List<Object> wantedItems = new java.util.ArrayList<>();
        if (wanted != null) {
            try {
                wantedItems = wanted.toList();
            } catch (org.json.JSONException e) {
                // malformed payload — fall through with an empty list → all aliases
            }
        }
        if (!wantedItems.isEmpty()) {
            for (Object o : wantedItems) {
                String alias = String.valueOf(o);
                for (String known : ALIASES) {
                    if (known.equals(alias) && !"granted".equals(statusFor(alias))) {
                        toAsk.add(alias);
                        break;
                    }
                }
            }
        } else {
            for (String alias : ALIASES) {
                if (!"granted".equals(statusFor(alias))) toAsk.add(alias);
            }
        }
        if (toAsk.isEmpty()) {
            // nothing left to ask — report current state
            call.resolve(statusAll());
            return;
        }
        rememberAsked(toAsk);
        requestPermissionForAliases(toAsk.toArray(new String[0]), call, "permsCallback");
    }

    @PermissionCallback
    private void permsCallback(PluginCall call) {
        call.resolve(statusAll());
    }

    private void rememberAsked(java.util.List<String> aliases) {
        Set<String> asked = new HashSet<>(prefs().getStringSet(KEY_ASKED, new HashSet<>()));
        asked.addAll(aliases);
        prefs().edit().putStringSet(KEY_ASKED, asked).apply();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", ctx.getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
        call.resolve();
    }
}
