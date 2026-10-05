package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AyWebsBrowsePlugin.class);
        // Google utilise Credential Manager ; les autres fournisseurs gardent
        // Custom Tabs sans ouvrir une tâche de navigateur séparée.
        registerPlugin(AyroviAuthTabPlugin.class);

        // Le partage et les liens profonds arrivent ici au lancement à froid.
        // onNewIntent() ne les couvre que si MainActivity existe déjà.
        Intent launchIntent = getIntent();
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) {
            Uri initialTarget = ayWebsTarget(launchIntent);
            if (initialTarget != null && getBridge() != null && getBridge().getWebView() != null) {
                // Laisser d'abord Capacitor créer sa WebView et charger son shell,
                // puis naviguer vers la route transmise par Android.
                getBridge().getWebView().post(() -> navigate(initialTarget));
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri target = ayWebsTarget(intent);
        if (target != null) {
            navigate(target);
        }
    }

    /**
     * Bouton retour matériel — corrigé le 2026-10-03.
     *
     * Avant : AUCUN onBackPressed n'existait, ni ici ni dans Capacitor 7
     * (`grep -rn onBackPressed node_modules/@capacitor/android/` → 0 occurrence,
     * la clé `android.handleBackButton` n'étant plus lue par le cœur). Le retour
     * système appelait donc le comportement par défaut d'Android : finish(),
     * c'est-à-dire la FERMETURE DE L'APPLICATION même quand un écran AYROVI était
     * ouvert par-dessus (Lens, OCEREX, assistant…).
     *
     * Or la coque empile ses écrans dans l'historique de la WebView : ouvrir Lens
     * ajoute une entrée (`history.length` 2 → 3, mesuré) et `history.back()`
     * referme bien la couche (vérifié en navigateur réel). Il suffit donc de
     * déléguer au retour d'historique tant qu'il en reste un :
     *   • un écran AYROVI est ouvert  → goBack() le referme (comportement attendu) ;
     *   • on est à la racine          → plus d'historique, on laisse Android fermer
     *                                   l'application (comportement attendu aussi).
     *
     * `enableOnBackInvokedCallback` n'est pas déclaré dans le Manifest, donc
     * onBackPressed reste le point d'entrée normal du retour système.
     */
    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null
            && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
            return;
        }
        super.onBackPressed();
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
            if (text.isEmpty()) {
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
            String query = data.getQuery();
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
