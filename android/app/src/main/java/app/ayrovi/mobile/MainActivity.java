package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;

/**
 * Coque native AYROVI (Capacitor 7) — récepteur de partage et liens profonds AYWEBs.
 *
 * §24 Partage Android : ACTION_SEND text/plain (un lien produit copié depuis un
 * navigateur ou un réseau social) ouvre AYWEBs avec le texte reçu. La coque ne
 * devine rien : elle transmet le texte brut, et c'est le pont de détection serveur
 * (POST /api/v1/aywebs/page/analyze) qui décide de la boutique, du type de page et
 * du produit. Boutique inconnue → demande d'achat avec l'URL, jamais un faux succès.
 *
 * §25 Liens profonds : ayrovi://aywebs, ayrovi://aywebs/product?url=…,
 * ayrovi://aywebs/cart, ayrovi://aywebs/order/AYW-000456. La coque traduit le lien
 * en route WEB de la même origine que server.url : aucune logique métier en Java,
 * aucun second écran natif, aucune duplication de l'application (§2).
 *
 * Le web reste souverain : si la cible est illisible, l'app s'ouvre normalement.
 */
public class MainActivity extends BridgeActivity {

    private static final String AYWEBS_SCHEME = "ayrovi";
    private static final String AYWEBS_HOST = "aywebs";
    private static final String AYWEBS_PATH = "/aywebs";

    /** Pont AYWEBs §9 : ouverture du navigateur marchand interne depuis le web. */
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AyWebsBrowsePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * BridgeActivity.load() appelle onNewIntent(getIntent()) après création du pont :
     * le démarrage à froid et la relance (launchMode singleTask) passent donc par le
     * même point d'entrée, sans duplicata de code.
     */
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
     * Cible web d'un intent AYWEBs, ou null quand l'intent ne concerne pas AYWEBs.
     * Visible pour test : la traduction est une fonction pure de l'intent.
     */
    Uri ayWebsTarget(Intent intent) {
        if (intent == null || bridge == null) {
            return null;
        }
        String action = intent.getAction();
        if (action == null) {
            return null;
        }
        String base = webBase();
        if (base == null) {
            return null;
        }

        if (Intent.ACTION_SEND.equals(action)) {
            if (!"text/plain".equals(intent.getType())) {
                return null;
            }
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String text = shared == null ? "" : shared.toString().trim();
            if (text.isEmpty()) {
                return null;
            }
            return Uri.parse(base + AYWEBS_PATH)
                .buildUpon()
                .appendQueryParameter("text", text)
                .build();
        }

        if (!Intent.ACTION_VIEW.equals(action)) {
            return null;
        }
        Uri data = intent.getData();
        if (data == null || data.getScheme() == null) {
            return null;
        }
        if (!AYWEBS_SCHEME.equalsIgnoreCase(data.getScheme())) {
            return null;
        }
        if (data.getHost() == null || !AYWEBS_HOST.equalsIgnoreCase(data.getHost())) {
            return null;
        }

        Uri.Builder target = Uri.parse(base + AYWEBS_PATH).buildUpon();
        String path = data.getPath();
        if (path != null && path.length() > 1) {
            for (String segment : path.split("/")) {
                if (!segment.isEmpty()) {
                    target.appendPath(segment);
                }
            }
        }
        for (String name : data.getQueryParameterNames()) {
            target.appendQueryParameter(name, data.getQueryParameter(name));
        }
        return target.build();
    }

    /**
     * Origine servie par la coque, lue dans la configuration Capacitor : elle n'est
     * jamais recopiée ici, sinon une migration de domaine casserait les liens.
     */
    private String webBase() {
        String serverUrl = bridge == null ? null : bridge.getServerUrl();
        if (serverUrl == null) {
            return null;
        }
        String trimmed = serverUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void navigate(Uri target) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            Logger.debug("[AyWebs] WebView indisponible : lien ignoré " + target);
            return;
        }
        Logger.debug("[AyWebs] partage / lien profond → " + target);
        // post() : la navigation passe après l'initialisation de la WebView,
        // aussi bien à froid qu'après un partage depuis l'app déjà ouverte.
        webView.post(() -> webView.loadUrl(target.toString()));
    }
}
