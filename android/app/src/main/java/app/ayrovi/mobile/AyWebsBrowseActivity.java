package app.ayrovi.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.os.Message;
import android.widget.Toast;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.RadioButton;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AYWEBs V2 — navigateur marchand natif (parcours proxy-shopping, référence
 * Add-to-Buyee captures 1/3/4).
 *
 * Flux canonique (AYWEBS_ADD_TO_CART_ORDER.md) :
 *   1. le client navigue chez le marchand DANS l'app (WebView) ;
 *   2. la barre flottante porte : retour, avant, Panier, Favoris et le bouton
 *      orange « Add to Cart » (libellé imposé par l'ordre permanent) ;
 *   3. le serveur classe la page (POST /api/v1/aywebs/page/analyze) : fiche
 *      produit → bouton actif ; sinon désactivé, jamais de faux succès ;
 *   4. la feuille de variantes s'ouvre PAR-DESSUS la page marchand (§13) ;
 *   5. confirmation « ajouté au panier AYROVI » sans quitter le magasin (§15) ;
 *   6. Panier / Favoris renvoient vers les routes WEB de la coque (une seule
 *      UI, une seule session, §2) : aucune logique métier en Java.
 */
public class AyWebsBrowseActivity extends Activity {

  public static final String EXTRA_SESSION_ID = "aywebs_session_id";
  public static final String EXTRA_WEB_BASE = "aywebs_web_base";
  /** Origine absolue de l'API, transmise par la couche web (voir apiOrigin.ts). */
  public static final String EXTRA_API_ORIGIN = "aywebs_api_origin";

  private static final String ANALYZE_PATH = "/api/v1/aywebs/page/analyze";
  private static final String RESOLVE_PATH = "/api/v1/aywebs/product/resolve";
  private static final String CART_ITEMS_PATH = "/api/v1/aywebs/cart/items";

  /**
   * Lien profond AYWEBs (Manifest §25) : c'est le SEUL format que
   * MainActivity.ayWebsTarget() accepte pour un Intent.ACTION_VIEW. La coque
   * retraduit ensuite `ayrovi://aywebs/cart` en `https://localhost/aywebs/cart`.
   */
  private static final String AYWEBS_DEEP_LINK = "ayrovi://aywebs";

  private WebView webView;
  private TextView urlText;
  private Button addButton;
  private Button cartButton;
  private Button wishButton;
  private ImageButton backButton;
  private ImageButton forwardButton;
  private ProgressBar progress;

  private String sessionId = "";
  private String webBase = "https://localhost";
  /**
   * Origine des appels API PRIVÉS de la coque (analyse / résolution / panier).
   * Distincte de `webBase` : `webBase` sert à ouvrir les routes WEB d'AYROVI
   * (paquet embarqué = https://localhost), tandis que l'API vit sur un autre
   * hôte. Les confondre était le défaut : les trois POST partaient vers
   * localhost, échouaient, et le bouton restait inerte ou bloqué sur
   * « Loading… ». Reste vide si la couche web ne l'a pas transmis.
   */
  private String apiOrigin = "";
  private String currentUrl = "";
  private volatile boolean productPage = false;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    setContentView(R.layout.activity_aywebs_browse);

    sessionId = getStringExtra(EXTRA_SESSION_ID);
    String base = getStringExtra(EXTRA_WEB_BASE);
    if (base != null && !base.trim().isEmpty()) webBase = base.trim();
    String origin = getStringExtra(EXTRA_API_ORIGIN);
    apiOrigin = origin == null ? "" : origin.trim();

    webView = requireView(R.id.aywebs_webview);
    urlText = requireView(R.id.aywebs_url);
    progress = requireView(R.id.aywebs_progress);
    backButton = requireView(R.id.aywebs_back);
    forwardButton = requireView(R.id.aywebs_forward);
    cartButton = requireView(R.id.aywebs_cart);
    wishButton = requireView(R.id.aywebs_wish);
    addButton = requireView(R.id.aywebs_add);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    CookieManager.getInstance().setAcceptCookie(true);

    // ── Connexion marchande (ajouté le 2026-10-03) ──────────────────────────
    // Deux réglages manquaient, et tous deux cassent la CONNEXION au marchand
    // sans le moindre message :
    //  • setAcceptThirdPartyCookies : depuis Android 5.0 le WebView refuse les
    //    cookies tiers par défaut. Or les parcours d'authentification
    //    (SSO, « Se connecter avec… », paniers invités) en dépendent : la page
    //    de login se recharge en boucle sur un écran déjà connecté.
    //  • setSupportMultipleWindows + setJavaScriptCanOpenWindows… : sans eux,
    //    `window.open()` est purement IGNORÉ. Les popups de login ne
    //    s'ouvraient donc jamais, et l'utilisateur ne pouvait pas se connecter
    //    (Buyee affiche d'ailleurs « free membership registration and login are
    //    required » avant de commander).
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
    settings.setSupportMultipleWindows(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(true);

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        progress.setVisibility(View.VISIBLE);
        setAddEnabled(false);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        progress.setVisibility(View.GONE);
        currentUrl = url;
        urlText.setText(Uri.parse(url).getHost() + uriPath(url));
        analyze(url);
        refreshNavButtons();
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String scheme = request.getUrl().getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
          return true; // aucune origine hors http(s) dans la coque
        }
        return false;
      }
    });

    // Popups de connexion : on les ouvre DANS la même WebView. C'est le seul
    // moyen de garder le contexte de session du marchand (les cookies de la
    // popup appartiennent au même profil) et, surtout, d'avoir un retour
    // visible au lieu d'un clic sans effet.
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(view);
        resultMsg.sendToTarget();
        return true;
      }
    });

    backButton.setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); });
    forwardButton.setOnClickListener(v -> { if (webView.canGoForward()) webView.goForward(); });
    cartButton.setOnClickListener(v -> openWebRoute("/aywebs/cart"));
    wishButton.setOnClickListener(v -> openWebRoute("/aywebs/wish"));
    addButton.setOnClickListener(v -> onAddToCart());

    Uri target = getIntent() == null ? null : getIntent().getData();
    String start = target != null ? target.toString() : "https://www.amazon.com/";
    webView.loadUrl(start);
  }

  private static String uriPath(String url) {
    try {
      String path = Uri.parse(url).getPath();
      if (path == null || path.isEmpty() || "/".equals(path)) return "";
      return path.length() > 24 ? path.substring(0, 24) + "…" : path;
    } catch (Exception error) {
      return "";
    }
  }

  private <T extends View> T requireView(int id) {
    return (T) findViewById(id);
  }

  private String getStringExtra(String key) {
    Intent intent = getIntent();
    return intent == null ? null : intent.getStringExtra(key);
  }

  private void refreshNavButtons() {
    backButton.setEnabled(webView.canGoBack());
    forwardButton.setEnabled(webView.canGoForward());
    backButton.setAlpha(webView.canGoBack() ? 1f : 0.35f);
    forwardButton.setAlpha(webView.canGoForward() ? 1f : 0.35f);
  }

  private void setAddEnabled(boolean enabled) {
    productPage = enabled;
    runOnUiThread(() -> {
      addButton.setEnabled(enabled);
      addButton.setText(enabled ? R.string.aywebs_add_to_cart : R.string.aywebs_not_product_page);
    });
  }

  /**
   * Le service n'a pas répondu. Auparavant cette situation était présentée comme
   * « Page non éligible » : un mensonge — la page était peut-être parfaitement
   * éligible, c'est AYROVI qui ne répondait pas. L'utilisateur cherche alors
   * pourquoi CE produit ne marche pas, au lieu de réessayer plus tard.
   */
  private void setAddUnavailable(boolean unavailable) {
    productPage = false;
    runOnUiThread(() -> {
      addButton.setEnabled(!unavailable);
      addButton.setText(unavailable ? R.string.aywebs_service_unavailable : R.string.aywebs_not_product_page);
    });
  }

  /** Message visible : un échec silencieux est vécu comme un bouton cassé. */
  private void toast(int resId) {
    runOnUiThread(() -> Toast.makeText(this, resId, Toast.LENGTH_LONG).show());
  }

  /** §11 : la coque ne devine rien — le serveur classe la page. */
  private void analyze(String url) {
    if (apiOrigin.isEmpty()) {
      // Sans origine d'API, tout appel échouerait : on le dit tout de suite,
      // au lieu de laisser croire que la page n'est pas éligible.
      setAddUnavailable(true);
      return;
    }
    executor.execute(() -> {
      try {
        JSONObject body = new JSONObject().put("url", url);
        JSONObject reply = post(apiOrigin + ANALYZE_PATH, body);
        JSONObject data = reply.optJSONObject("data");
        if (data == null) { setAddUnavailable(true); return; }

        boolean isProduct = data.optBoolean("is_product_page", false)
            && data.optBoolean("capture_allowed", false);

        // Le serveur classe la page BIEN plus finement que « produit / pas produit » :
        // il distingue LOGIN, CHECKOUT, CAPTCHA, SEARCH, HOME. La coque réduisait
        // tout cela à « Page non éligible » — un message qui n'aide personne.
        // Cas observés en direct sur amazon.co.jp :
        //   /ap/signin          → page_type=LOGIN,    action=LOGIN
        //   /gp/cart/view.html  → page_type=CHECKOUT, action=NONE
        //   /dp/XXXX            → page_type=PRODUCT,  capture_allowed=true
        // Aucune de ces pages n'est « non éligible » : chacune attend un geste
        // différent de l'utilisateur, et le contrat serveur (§27) interdit de
        // contourner une page LOGIN — la coque doit donc l'EXPLIQUER.
        if (isProduct) {
          setAddEnabled(true);
          return;
        }
        String pageType = data.optString("page_type", "");
        String action = data.optString("customer_action_required", "NONE");
        if ("LOGIN".equals(action) || "LOGIN".equals(pageType)) {
          setAddLabel(R.string.aywebs_login_required);
          toast(R.string.aywebs_login_explained);
          return;
        }
        if ("CAPTCHA".equals(action) || "CAPTCHA".equals(pageType)) {
          setAddLabel(R.string.aywebs_captcha_page);
          return;
        }
        if ("CHECKOUT".equals(pageType)) {
          setAddLabel(R.string.aywebs_merchant_cart);
          toast(R.string.aywebs_merchant_cart_explained);
          return;
        }
        setAddUnavailable(false);
      } catch (Exception error) {
        // Panne réseau / service indisponible ≠ page non éligible.
        setAddUnavailable(true);
      }
    });
  }

  /** Libellé explicatif sur le bouton, sans le réactiver (rien à ajouter ici). */
  private void setAddLabel(int resId) {
    productPage = false;
    runOnUiThread(() -> {
      addButton.setEnabled(false);
      addButton.setText(resId);
    });
  }

  /** §13/§15 : ajout réel — feuille de variantes par-dessus le marchand. */
  private void onAddToCart() {
    if (!productPage || currentUrl.isEmpty()) return;
    runOnUiThread(() -> addButton.setText(R.string.aywebs_loading));
    executor.execute(() -> {
      try {
        JSONObject body = new JSONObject().put("url", currentUrl);
        JSONObject reply = post(apiOrigin + RESOLVE_PATH, body);
        JSONObject product = reply.optJSONObject("data");
        runOnUiThread(() -> {
          if (product == null) {
            // Le serveur répond mais ne reconnaît pas le produit : c'est un cas
            // métier légitime, on le dit au lieu de remettre le bouton en silence.
            addButton.setText(R.string.aywebs_add_to_cart);
            toast(R.string.aywebs_product_not_resolved);
            return;
          }
          showVariantSheet(product);
        });
      } catch (Exception error) {
        runOnUiThread(() -> addButton.setText(R.string.aywebs_add_to_cart));
        toastMessage(error.getMessage());
      }
    });
  }

  /** Toast avec un texte venu du serveur (repli : message générique). */
  private void toastMessage(String message) {
    final String text = message == null || message.isEmpty()
        ? getString(R.string.aywebs_add_failed) : message;
    runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
  }

  private void showVariantSheet(JSONObject product) {
    Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.dialog_aywebs_variant_sheet);
    TextView name = dialog.findViewById(R.id.aywebs_sheet_product);
    LinearLayout groupsBox = dialog.findViewById(R.id.aywebs_sheet_groups);
    Spinner qty = dialog.findViewById(R.id.aywebs_sheet_qty);
    Button confirm = dialog.findViewById(R.id.aywebs_sheet_add);
    ImageButton close = dialog.findViewById(R.id.aywebs_sheet_close);

    name.setText(product.optString("title", ""));
    qty.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
        new String[] {"1", "2", "3", "4", "5", "6", "7", "8", "9", "10"}));

    Map<String, Spinner> groupSpinners = new LinkedHashMap<>();
    JSONArray groups = product.optJSONArray("variant_groups");
    if (groups != null) {
      for (int index = 0; index < groups.length(); index++) {
        JSONObject group = groups.optJSONObject(index);
        if (group == null) continue;
        String attribute = group.optString("attribute", "");
        JSONArray values = group.optJSONArray("values");
        if (attribute.isEmpty() || values == null || values.length() < 2) continue;
        TextView label = new TextView(this);
        label.setText(attribute);
        label.setPadding(0, 12, 0, 4);
        groupsBox.addView(label);
        Spinner spinner = new Spinner(this);
        List<String> options = new ArrayList<>();
        for (int valueIndex = 0; valueIndex < values.length(); valueIndex++) {
          options.add(values.optString(valueIndex, ""));
        }
        spinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, options));
        groupsBox.addView(spinner);
        groupSpinners.put(attribute, spinner);
      }
    }

    close.setOnClickListener(v -> dialog.dismiss());
    confirm.setOnClickListener(v -> {
      JSONObject attributes = new JSONObject();
      try {
        attributes.put("condition", "new");
        for (Map.Entry<String, Spinner> entry : groupSpinners.entrySet()) {
          attributes.put(entry.getKey(), String.valueOf(entry.getValue().getSelectedItem()));
        }
        int quantity = Integer.parseInt(String.valueOf(qty.getSelectedItem()));
        JSONObject body = new JSONObject()
            .put("product_id", product.optString("product_id", ""))
            .put("source_url", product.optString("source_url", currentUrl))
            .put("store_id", product.optString("store_id", ""))
            .put("variant_attributes", attributes)
            .put("quantity", quantity);
        dialog.dismiss();
        runOnUiThread(() -> addButton.setText(R.string.aywebs_loading));
        executor.execute(() -> {
          try {
            post(apiOrigin + CART_ITEMS_PATH, body);
            runOnUiThread(() -> {
              addButton.setText(R.string.aywebs_add_to_cart);
              showAddedDialog(product.optString("title", ""));
            });
          } catch (Exception error) {
            runOnUiThread(() -> addButton.setText(R.string.aywebs_add_to_cart));
            toastMessage(error.getMessage());
          }
        });
      } catch (Exception error) {
        dialog.dismiss();
      }
    });
    dialog.show();
  }

  /** §15 : confirmation sans quitter le magasin, deux sorties honnêtes. */
  private void showAddedDialog(String title) {
    Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.dialog_aywebs_added);
    TextView addedTitle = dialog.findViewById(R.id.aywebs_added_title);
    Button checkout = dialog.findViewById(R.id.aywebs_added_checkout);
    Button continueShopping = dialog.findViewById(R.id.aywebs_added_continue);
    addedTitle.setText(title);
    checkout.setOnClickListener(v -> {
      dialog.dismiss();
      openWebRoute("/aywebs/cart");
    });
    continueShopping.setOnClickListener(v -> {
      dialog.dismiss();
      setAddEnabled(productPage);
    });
    dialog.show();
  }

  /** Une seule UI : les écrans AYROVI sont les routes WEB de la coque. */
  private void openWebRoute(String route) {
    // ── Corrigé le 2026-10-03 (P0 : « Ajouter au panier » ne faisait rien) ──
    // L'ancien code construisait l'intent ainsi :
    //     Intent intent = new Intent(this, MainActivity.class);   // AUCUNE action
    //     intent.setData(Uri.parse(webBase + route));             // https://localhost/…
    // Or MainActivity.ayWebsTarget() commence par :
    //     String action = intent.getAction();
    //     if (action == null) return null;                        // → sortie immédiate
    // donc aucune navigation ne pouvait se produire ; et même avec ACTION_VIEW, la
    // cible restait nulle puisque ce contrôle exige le schéma `ayrovi://aywebs`.
    // L'intent doit donc être un VRAI lien profond AYWEBs, exactement comme ceux
    // déclarés dans le Manifest (§25). MainActivity le retraduit en route web servie.
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(AYWEBS_DEEP_LINK + route));
    intent.setClass(this, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    startActivity(intent);
    finish();
  }

  private JSONObject post(String endpoint, JSONObject body) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
    connection.setRequestMethod("POST");
    connection.setConnectTimeout(12_000);
    connection.setReadTimeout(20_000);
    connection.setRequestProperty("content-type", "application/json");
    if (!sessionId.isEmpty()) connection.setRequestProperty("x-session-id", sessionId);
    connection.setDoOutput(true);
    try (OutputStream out = connection.getOutputStream()) {
      out.write(body.toString().getBytes(StandardCharsets.UTF_8));
    }
    int code = connection.getResponseCode();
    InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    if (stream != null) {
      byte[] chunk = new byte[8192];
      int read;
      while ((read = stream.read(chunk)) > 0) buffer.write(chunk, 0, read);
    }
    String text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    if (code >= 400) {
      // Le serveur répond avec un CONTRAT d'erreur explicite :
      //   { code, error, error_contract: { userMessage, recoverable,
      //     retryAllowed, requiredAction } }
      // La coque jetait tout cela et affichait « Ajout impossible ». On remonte
      // donc le message destiné au client : « La boutique demande une connexion »,
      // « Cette page est le panier de la boutique », « Le devis AYROVI est
      // indisponible pour cette devise »… — autant d'informations qui changent
      // ce que l'utilisateur peut faire ensuite.
      throw new AyWebsApiException(code, userMessageOf(text));
    }
    return new JSONObject(text);
  }

  /** Message destiné au client, extrait du contrat d'erreur serveur. */
  private static String userMessageOf(String body) {
    try {
      JSONObject parsed = new JSONObject(body);
      JSONObject contract = parsed.optJSONObject("error_contract");
      if (contract != null) {
        String message = contract.optString("userMessage", "");
        if (!message.isEmpty()) return message;
      }
      return parsed.optString("error", "");
    } catch (Exception ignored) {
      return "";
    }
  }

  /** Erreur d'API portant le message utilisateur du serveur (ou vide). */
  private static final class AyWebsApiException extends Exception {
    AyWebsApiException(int status, String userMessage) {
      super(userMessage == null || userMessage.isEmpty() ? "AYWEBS_HTTP_" + status : userMessage);
    }
  }

  @Override
  protected void onDestroy() {
    executor.shutdownNow();
    if (webView != null) webView.destroy();
    super.onDestroy();
  }
}
