package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;

/**
 * Coque native AYROVI (Capacitor 7) — application réelle à paquet embarqué.
 *
 * §24 Partage Android : ACTION_SEND text/plain → route WEB /aywebs?url=…
 * §25 Liens profonds : ayrovi://aywebs[/cart|/wish|/product?url=…] → routes WEB
 *     de l'origine servie (paquet embarqué : https://localhost).
 *
 * La coque traduit, elle ne décide rien : aucune logique métier en Java,
 * aucune UI dupliquée (§2) — l'UI est celle du site, embarquée dans l'APK.
 */
public class MainActivity extends BridgeActivity {

    private static final String AYWEBS_SCHEME = "ayrovi";
    private static final String AYWEBS_HOST = "aywebs";
    private static final String AYWEBS_PATH = "/aywebs";
    private static final String BUNDLED_ORIGIN = "https://localhost";

    private Uri pendingTarget;
    private boolean pageReady;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AyWebsBrowsePlugin.class);
        // Connexion par fournisseur en onglet personnalisé : DANS l'app, sans
        // bascule vers Chrome (remarque du 04/10/2026).
        registerPlugin(AyroviAuthTabPlugin.class);
        super.onCreate(savedInstanceState);
        pendingTarget = savedInstanceState == null ? ayWebsTarget(getIntent())
            : (savedInstanceState.getString("aywebsPending") == null ? null : Uri.parse(savedInstanceState.getString("aywebsPending")));
        getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageStarted(WebView view) { pageReady = false; }
            @Override public void onPageLoaded(WebView view) { pageReady = true; drainPending(); }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (getBridge().getWebView().canGoBack()) getBridge().getWebView().goBack();
                else { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); setEnabled(true); }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri target = ayWebsTarget(intent);
        if (target != null) {
            pendingTarget = target;
            drainPending();
        }
    }

    @Override public void onSaveInstanceState(Bundle state) {
        if (pendingTarget != null) state.putString("aywebsPending", pendingTarget.toString());
        super.onSaveInstanceState(state);
    }

    private void drainPending() {
        if (!pageReady || pendingTarget == null) return;
        Uri target = pendingTarget;
        pendingTarget = null; // clear before navigation invokes lifecycle callbacks
        navigate(target);
    }

    /** Cible web d'un intent AYWEBs, ou null quand l'intent ne concerne pas AYWEBs. */
    Uri ayWebsTarget(Intent intent) {
        if (intent == null) {
            return null;
        }
        String action = intent.getAction();
        if (action == null) {
            return null;
        }
        String base = webBase();

        if (Intent.ACTION_SEND.equals(action)) {
            if (!"text/plain".equals(intent.getType())) {
                return null;
            }
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String text = shared == null ? "" : shared.toString().trim();
            if (text.isEmpty() || text.length() > 4096) {
                return null;
            }
            return Uri.parse(base + AYWEBS_PATH + "?url=" + Uri.encode(text));
        }

        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data == null
                || !AYWEBS_SCHEME.equalsIgnoreCase(data.getScheme())
                || !AYWEBS_HOST.equalsIgnoreCase(data.getHost())) {
                return null;
            }
            String path = data.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) {
                return Uri.parse(base + AYWEBS_PATH);
            }
            if (!path.matches("/(cart|wish|product)/?")) return null;
            String query = data.getEncodedQuery();
            if (query != null && query.length() > 8192) return null;
            return Uri.parse(base + AYWEBS_PATH + path + (query == null ? "" : "?" + query));
        }
        return null;
    }

    /** Origine servie : coque vivante si configurée, sinon paquet embarqué. */
    String webBase() {
        if (getBridge() != null && getBridge().getServerUrl() != null
            && !getBridge().getServerUrl().trim().isEmpty()) {
            return getBridge().getServerUrl().trim();
        }
        return BUNDLED_ORIGIN;
    }

    private void navigate(Uri target) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().loadUrl(target.toString());
        }
    }
}
