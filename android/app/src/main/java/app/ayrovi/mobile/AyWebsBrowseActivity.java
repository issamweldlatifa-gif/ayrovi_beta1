package app.ayrovi.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
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
  /**
   * Jeton de session CLIENT (04/10/2026). Le panier proxy suit `x-session-id`,
   * mais les favoris appartiennent au COMPTE : sans ce jeton, le tiroir
   * « Favoris » ne pourrait qu'afficher « connectez-vous », même connecté.
   * Transmis par la couche web (rememberNativeSessionToken), vide sur le web.
   */
  public static final String EXTRA_CUSTOMER_TOKEN = "aywebs_customer_token";

  private static final String ANALYZE_PATH = "/api/v1/aywebs/page/analyze";
  private static final String RESOLVE_PATH = "/api/v1/aywebs/product/resolve";
  private static final String CART_ITEMS_PATH = "/api/v1/aywebs/cart/items";
  /** Lecture du panier proxy pour le tiroir interne (04/10/2026). */
  private static final String CART_PATH = "/api/v1/aywebs/cart";
  /** Favoris du COMPTE : même magasin que « Mon compte » et que l'onglet web. */
  private static final String FAVORITES_PATH = "/api/customer/account/favorites";
  /** Point d'appel le moins coûteux du serveur : sert uniquement à le réveiller. */
  private static final String HEALTH_PATH = "/api/customer/auth/config";
  /** Connexion DANS le tiroir : l'utilisateur ne quitte pas sa boutique. */
  private static final String LOGIN_PATH = "/api/customer/auth/email/login";

  /**
   * HTML de la fiche TELLE QU'AFFICHÉE dans la WebView (04/10/2026).
   *
   * Pourquoi : Amazon sert aux IP de centre de données (Render) une coquille
   * sans prix ni variantes ; la page affichée sur le téléphone du client, elle,
   * publie le prix, les tailles et les couleurs. On envoie donc au serveur le
   * HTML de CETTE page ; le serveur le relit avec SON parseur et calcule le prix
   * — le client apporte une page, jamais un prix (§45).
   *
   * Les <script> sans données produit sont retirés avant envoi : ils constituent
   * l'essentiel du poids (mesuré : page Amazon 1,3 Mo). Les blocs de données
   * produit (données structurées, `sortedDimValuesForAllDims`,
   * `dimensionValuesDisplayData`, `displayPrice`…) sont conservés tels quels.
   */
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
  /**
   * §5 (04/10/2026) — ces deux boutons existaient dans le XML
   * (`activity_aywebs_browse.xml`) mais n'étaient référencés NULLE PART en
   * Java : zéro `findViewById`, zéro `setOnClickListener`. Les appuis sur X et
   * sur ↻ partaient donc dans le vide, sans la moindre trace.
   */
  private ImageButton closeButton;
  private ImageButton refreshButton;
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
  private String customerToken = "";
  private String currentUrl = "";
  private volatile boolean productPage = false;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  // ── PRÉ-RÉSOLUTION (05/10/2026) ───────────────────────────────────────────
  // Plainte client : « le produit ajouté avec son prix met plus de vingt
  // secondes à apparaître ». La lecture marchande est le seul poste coûteux du
  // parcours ; or, dès que le serveur classe la page en fiche produit, on sait
  // que l'utilisateur peut appuyer sur « Add to Cart » à tout moment. La
  // résolution est donc payée PENDANT qu'il lit la fiche (agent d'exécution
  // unique : elle ne concurrence aucun autre appel de la coque), et l'appui
  // ouvre la feuille immédiatement.
  //
  // Fenêtre courte et honnête : le résultat pré-résolu n'est réutilisé que pour
  // la MÊME URL et moins de deux minutes ; au-delà, la coque redemande la
  // résolution (le serveur applique alors son propre cache de lecture et
  // recalcule toujours le prix AYROVI, §45).
  private static final long PREFETCH_FRESH_MS = 120_000L;
  private volatile JSONObject prefetchedProduct;
  private volatile String prefetchedUrl = "";
  private volatile long prefetchedAtMs = 0L;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    if (android.os.Build.VERSION.SDK_INT < 28) { finish(); return; }
    setContentView(R.layout.activity_aywebs_browse);
    installBackNavigation();
    View root = ((android.view.ViewGroup) findViewById(android.R.id.content)).getChildAt(0);
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.ime());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });

    sessionId = getStringExtra(EXTRA_SESSION_ID);
    if (sessionId == null) sessionId = "";
    String base = getStringExtra(EXTRA_WEB_BASE);
    // Local navigation base is fixed; Intent data must not choose it.
    webBase = "https://localhost";
    String origin = getStringExtra(EXTRA_API_ORIGIN);
    apiOrigin = BuildConfig.AYROVI_API_ORIGIN;
    if (origin != null && !origin.isEmpty() && !ApiTrust.sameOrigin(origin, apiOrigin)) { finish(); return; }
    customerToken = NativeSession.read(this);

    webView = requireView(R.id.aywebs_webview);
    urlText = requireView(R.id.aywebs_url);
    progress = requireView(R.id.aywebs_progress);
    backButton = requireView(R.id.aywebs_back);
    forwardButton = requireView(R.id.aywebs_forward);
    closeButton = requireView(R.id.aywebs_close);
    refreshButton = requireView(R.id.aywebs_refresh);
    cartButton = requireView(R.id.aywebs_cart);
    wishButton = requireView(R.id.aywebs_wish);
    addButton = requireView(R.id.aywebs_add);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
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
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
    settings.setSupportMultipleWindows(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);

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
        if (!ApiTrust.browsable(request.getUrl().toString())) {
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
        // Merchant popup target is unknown here; fail closed. Users can use
        // the merchant's normal in-page navigation instead.
        Toast.makeText(AyWebsBrowseActivity.this, "Fenêtre bloquée : utilisez le lien dans la page.", Toast.LENGTH_SHORT).show();
        return false;
      }
    });

    closeButton.setOnClickListener(v -> onClosePressed());
    refreshButton.setOnClickListener(v -> webView.reload());
    backButton.setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); });
    forwardButton.setOnClickListener(v -> { if (webView.canGoForward()) webView.goForward(); });
    // ── Remarque client du 04/10/2026 ────────────────────────────────────────
    // « زر panier يكون زدا دراو داخل متجر … واي حجا تم داخل متجر تقعد داخل متجر ».
    // Ces deux lignes appelaient openWebRoute(), c'est-à-dire
    // startActivity(deep link) + finish() : la page marchande était DÉTRUITE,
    // l'utilisateur éjecté de sa boutique au milieu de ses achats, et son
    // défilement perdu. Consulter son panier n'est pas quitter sa boutique.
    // Les deux ouvrent désormais un TIROIR par-dessus la WebView, qui reste
    // vivante dessous.
    cartButton.setOnClickListener(v -> openListSheet(true));
    wishButton.setOnClickListener(v -> openListSheet(false));
    addButton.setOnClickListener(v -> onAddToCart());

    // Réveil immédiat du service : il dort après inactivité et met ~1 minute à
    // se lever. Lancé ici, il est debout bien avant que l'utilisateur n'ouvre
    // une fiche produit — c'est ce qui supprime l'attente et le « timeout »
    // sur le premier ajout au panier.
    warmUpApi();

    Uri target = getIntent() == null ? null : getIntent().getData();
    String start = target != null ? target.toString() : "https://www.amazon.com/";
    if (!ApiTrust.browsable(start)) { finish(); return; }
    if (NativeSession.clearMarker(this).exists()) MerchantDataService.clear(this, () -> webView.loadUrl(start));
    else webView.loadUrl(start);
  }

  /**
   * §5 — « X » REVIENT à AYROVI, il ne tue jamais l'application.
   *
   * Deux situations réelles :
   *  • le navigateur marchand a été ouvert PAR-DESSUS l'app (cas normal) :
   *    `finish()` suffit, MainActivity est encore dessous, intacte ;
   *  • le navigateur EST la racine de la tâche (arrivée par lien profond ou
   *    par partage) : `finish()` fermerait l'application. On ouvre alors
   *    AyWebs explicitement, par le même lien profond que Panier/Favoris.
   */
  private void onClosePressed() {
    if (isTaskRoot()) {
      openWebRoute("");
      return;
    }
    finish();
  }

  private void installBackNavigation() {
    // API 33+ : le geste système passe par OnBackInvokedDispatcher dès que la
    // navigation prédictive est active — `onBackPressed()` n'est alors plus
    // appelé du tout. On enregistre le même comportement des deux côtés.
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
        android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBackPressed);
    }
  }

  /** D'abord l'historique marchand, puis la même sortie que X. */
  private void handleBackPressed() {
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    onClosePressed();
  }

  /** API < 33 (cette activité hérite d'`Activity`, pas de `ComponentActivity`). */
  @Override
  public void onBackPressed() {
    handleBackPressed();
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
          // Fiche produit confirmée par le serveur : on lance la résolution
          // maintenant, en silence, plutôt que d'attendre l'appui.
          prefetchResolve(url);
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
    final String url = currentUrl;

    // 1) Pré-résolution fraîche pour CETTE url : la feuille s'ouvre tout de
    //    suite, aucun aller-retour marchand n'est payé au moment de l'appui.
    JSONObject ready = prefetchedProductFor(url);
    if (ready != null) {
      showVariantSheet(ready);
      return;
    }

    runOnUiThread(() -> addButton.setText(R.string.aywebs_loading));
    // URL only. Never transmit the merchant DOM, scripts, account or form data.
    executor.execute(() -> {
      try {
        // 2) L'agent d'exécution est unique : la pré-résolution lancée pendant
        //    la navigation a pu aboutir entre-temps. On la réutilise (même url,
        //    moins de deux minutes) au lieu de relancer une lecture.
        JSONObject product = prefetchedProductFor(url);
        if (product == null) {
          JSONObject body = new JSONObject().put("url", url);
          JSONObject reply = post(apiOrigin + RESOLVE_PATH, body);
          product = reply.optJSONObject("data");
        }
        final JSONObject resolved = product;
        runOnUiThread(() -> {
          if (resolved == null) {
            // Le serveur répond mais ne reconnaît pas le produit : c'est un cas
            // métier légitime, on le dit au lieu de remettre le bouton en silence.
            addButton.setText(R.string.aywebs_add_to_cart);
            toast(R.string.aywebs_product_not_resolved);
            return;
          }
          showVariantSheet(resolved);
        });
      } catch (Exception error) {
        runOnUiThread(() -> addButton.setText(R.string.aywebs_add_to_cart));
        toastMessage(error.getMessage());
      }
    });
  }

  /**
   * Résolution anticipée d'une fiche produit, exécutée sur l'agent unique de la
   * coque pendant que l'utilisateur lit la page. Silencieuse et non bloquante :
   * un échec ne change rien au parcours, l'appui refera la demande normalement.
   * Aucune donnée marchande n'est transmise : seulement l'URL (même contrat que
   * `onAddToCart`), et le prix reste calculé par le serveur.
   */
  private void prefetchResolve(String url) {
    if (apiOrigin.isEmpty() || url == null || url.isEmpty()) return;
    if (prefetchedProductFor(url) != null) return;
    executor.execute(() -> {
      try {
        JSONObject body = new JSONObject().put("url", url);
        JSONObject reply = post(apiOrigin + RESOLVE_PATH, body);
        JSONObject product = reply.optJSONObject("data");
        if (product == null) return;
        prefetchedProduct = product;
        prefetchedUrl = url;
        prefetchedAtMs = System.currentTimeMillis();
      } catch (Exception ignored) {
        /* la pré-résolution est un confort, jamais une condition */
      }
    });
  }

  /** Produit pré-résolu réutilisable pour cette url, ou null si trop ancien. */
  private JSONObject prefetchedProductFor(String url) {
    JSONObject product = prefetchedProduct;
    if (product == null || url == null || !url.equals(prefetchedUrl)) return null;
    return System.currentTimeMillis() - prefetchedAtMs <= PREFETCH_FRESH_MS ? product : null;
  }

  /** Toast avec un texte venu du serveur (repli : message générique). */
  private void toastMessage(String message) {
    final String text = message == null || message.isEmpty()
        ? getString(R.string.aywebs_add_failed) : message;
    runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
  }

  /**
   * Feuille de variantes PAR-DESSUS la page marchand. La vue native suit le
   * panneau de sélection de la référence, sans quitter le magasin : contenu en
   * ligne image/titre, options publiées, quantité et ajout.
   */
  private void showVariantSheet(JSONObject product) {
    Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.dialog_aywebs_variant_sheet);
    TextView name = dialog.findViewById(R.id.aywebs_sheet_product);
    ImageView thumb = dialog.findViewById(R.id.aywebs_sheet_image);
    TextView conditionLine = dialog.findViewById(R.id.aywebs_sheet_condition);
    TextView availabilityLine = dialog.findViewById(R.id.aywebs_sheet_availability);
    TextView priceLine = dialog.findViewById(R.id.aywebs_sheet_price);
    TextView errorLine = dialog.findViewById(R.id.aywebs_sheet_error);
    LinearLayout groupsBox = dialog.findViewById(R.id.aywebs_sheet_groups);
    Spinner qty = dialog.findViewById(R.id.aywebs_sheet_qty);
    Button confirm = dialog.findViewById(R.id.aywebs_sheet_add);
    ImageButton close = dialog.findViewById(R.id.aywebs_sheet_close);

    name.setText(product.optString("title", ""));
    JSONArray images = product.optJSONArray("images");
    if (images != null && images.length() > 0) loadThumb(thumb, images.optString(0, ""));

    String conditionText = conditionLabel(product.optString("condition", ""));
    if (!conditionText.isEmpty()) {
      conditionLine.setText(conditionText);
      conditionLine.setVisibility(View.VISIBLE);
    }
    JSONObject availability = product.optJSONObject("availability");
    String availabilityText = availabilityLabel(availability == null ? "" : availability.optString("state", ""));
    if (!availabilityText.isEmpty()) {
      availabilityLine.setText(availabilityText);
      availabilityLine.setVisibility(View.VISIBLE);
    }

    double price = product.optDouble("price", 0);
    JSONObject ayroviPricing = product.optJSONObject("ayrovi_pricing");
    double estimateTnd = ayroviPricing == null ? 0 : ayroviPricing.optDouble("total_tnd", 0);
    boolean quoteReady = price > 0 && estimateTnd > 0;
    if (price > 0) {
      String sourcePrice = money(price) + " " + product.optString("currency", "").trim();
      priceLine.setText(quoteReady
          ? sourcePrice + "  ·  ≈ " + money(estimateTnd) + " TND"
          : sourcePrice);
      priceLine.setVisibility(View.VISIBLE);
    }
    if (!quoteReady) {
      errorLine.setText(R.string.aywebs_quote_unavailable);
      errorLine.setVisibility(View.VISIBLE);
      confirm.setEnabled(false);
      confirm.setAlpha(0.55f);
    }

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
        if (attribute.isEmpty() || values == null || values.length() == 0) continue;
        // Valeur unique = donnée publiée (ex. « Format : Kindle »), pas un choix.
        if (values.length() == 1) {
          TextView info = new TextView(this);
          info.setText(attribute + " : " + values.optString(0, ""));
          info.setPadding(0, 8, 0, 0);
          groupsBox.addView(info);
          continue;
        }
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
      if (!quoteReady) return;
      JSONObject attributes = new JSONObject();
      try {
        // Uniquement les attributs publiés par le marchand et choisis ici :
        // la coque n'ajoute plus `condition` (cause racine de l'échec corrigé).
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
        confirm.setEnabled(false);
        confirm.setText(R.string.aywebs_loading);
        errorLine.setVisibility(View.GONE);
        runOnUiThread(() -> addButton.setText(R.string.aywebs_loading));
        executor.execute(() -> {
          try {
            // La feuille reste ouverte pendant la requête. Aucun faux succès :
            // la confirmation n'apparaît qu'après une vraie réponse 2xx (§15).
            JSONObject response = post(apiOrigin + CART_ITEMS_PATH, body);
            JSONObject data = response.optJSONObject("data");
            JSONObject item = data == null ? null : data.optJSONObject("item");
            runOnUiThread(() -> {
              addButton.setText(R.string.aywebs_add_to_cart);
              dialog.dismiss();
              showAddedDialog(item, product);
            });
          } catch (Exception error) {
            runOnUiThread(() -> {
              addButton.setText(R.string.aywebs_add_to_cart);
              confirm.setEnabled(true);
              confirm.setText(R.string.aywebs_add_to_cart);
              showSheetError(errorLine, error.getMessage());
            });
          }
        });
      } catch (Exception error) {
        showSheetError(errorLine, error.getMessage());
      }
    });
    showAyWebsSheetDialog(dialog);
  }

  /** Erreur de devis ou d'ajout visible dans la feuille, pas perdue en toast. */
  private void showSheetError(TextView errorLine, String message) {
    if (errorLine == null) return;
    String text = message == null || message.trim().isEmpty()
        ? getString(R.string.aywebs_add_failed) : message.trim();
    errorLine.setText(text);
    errorLine.setVisibility(View.VISIBLE);
  }

  /** Dialog pleine largeur, ancrée en bas comme une feuille mobile. */
  private void showAyWebsSheetDialog(Dialog dialog) {
    dialog.show();
    android.view.Window window = dialog.getWindow();
    if (window == null) return;
    window.setBackgroundDrawableResource(android.R.color.transparent);
    window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
    window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
    window.setGravity(Gravity.BOTTOM);
    WindowManager.LayoutParams params = window.getAttributes();
    params.width = WindowManager.LayoutParams.MATCH_PARENT;
    params.height = WindowManager.LayoutParams.WRAP_CONTENT;
    params.gravity = Gravity.BOTTOM;
    params.dimAmount = 0.45f;
    window.setAttributes(params);
  }

  /** §15 : confirmation sans quitter le magasin, deux sorties honnêtes. */
  private void showAddedDialog(JSONObject item, JSONObject product) {
    JSONObject line = item == null ? new JSONObject() : item;
    Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.dialog_aywebs_added);
    ImageButton close = dialog.findViewById(R.id.aywebs_added_close);
    ImageView thumb = dialog.findViewById(R.id.aywebs_added_image);
    TextView addedTitle = dialog.findViewById(R.id.aywebs_added_title);
    TextView addedOptions = dialog.findViewById(R.id.aywebs_added_options);
    TextView addedTotals = dialog.findViewById(R.id.aywebs_added_totals);
    Button checkout = dialog.findViewById(R.id.aywebs_added_checkout);
    Button continueShopping = dialog.findViewById(R.id.aywebs_added_continue);

    // Tout ce qui est affiché vient de la LIGNE renvoyée par le serveur : image,
    // titre, options retenues, quantité et montant — jamais une intention locale.
    addedTitle.setText(line.optString("title", product.optString("title", "")));
    JSONArray images = line.optJSONArray("images");
    if (images == null || images.length() == 0) images = product.optJSONArray("images");
    if (images != null && images.length() > 0) loadThumb(thumb, images.optString(0, ""));
    String variantLabel = line.optString("variant_label", "");
    addedOptions.setText(variantLabel.isEmpty() ? getString(R.string.aywebs_no_options) : variantLabel);
    int quantity = line.optInt("quantity", 1);
    String currency = line.optString("currency", "").trim();
    addedTotals.setText(getString(R.string.aywebs_added_line,
        quantity, money(line.optDouble("unit_price", 0)) + " " + currency,
        money(line.optDouble("line_total_tnd", 0))));

    close.setOnClickListener(v -> {
      dialog.dismiss();
      setAddEnabled(productPage);
    });
    checkout.setOnClickListener(v -> {
      dialog.dismiss();
      openWebRoute("/aywebs/cart");
    });
    continueShopping.setOnClickListener(v -> {
      dialog.dismiss();
      setAddEnabled(productPage);
    });
    showAyWebsSheetDialog(dialog);
  }

  /** Miniature de la fiche ; un échec réseau laisse simplement l'image vide. */
  private void loadThumb(ImageView view, String url) {
    if (view == null || url == null || url.isEmpty()) return;
    executor.execute(() -> {
      try {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(12_000);
        try (InputStream stream = connection.getInputStream()) {
          Bitmap bitmap = BitmapFactory.decodeStream(stream);
          if (bitmap != null) runOnUiThread(() -> view.setImageBitmap(bitmap));
        }
      } catch (Exception ignored) {
        // Aucune image : l'écran reste utilisable et n'invente rien.
      }
    });
  }

  /** Montant lisible : 990 au lieu de 990.0, 41.99 inchangé. */
  private static String money(double value) {
    if (value == Math.rint(value)) return String.valueOf((long) value);
    return String.format(java.util.Locale.US, "%.2f", value);
  }

  /** État publié par la source ; non publié ⇒ aucune ligne affichée. */
  private String conditionLabel(String condition) {
    switch (condition) {
      case "new": return getString(R.string.aywebs_condition_new);
      case "used": return getString(R.string.aywebs_condition_used);
      case "refurbished": return getString(R.string.aywebs_condition_refurbished);
      default: return "";
    }
  }

  /** Disponibilité CONFIRMÉE uniquement : UNKNOWN n'est jamais montré comme dispo. */
  private String availabilityLabel(String state) {
    switch (state) {
      case "AVAILABLE": return getString(R.string.aywebs_availability_in_stock);
      case "LOW_STOCK": return getString(R.string.aywebs_availability_low);
      case "OUT_OF_STOCK": return getString(R.string.aywebs_availability_out);
      default: return "";
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIROIRS INTERNES — « Panier » et « Favoris » SANS quitter la boutique
  //
  // Règle posée par le client le 04/10/2026 : tout ce qui se passe dans une
  // boutique RESTE dans la boutique. Trois sorties seulement sont légitimes,
  // et elles sont toutes explicites : le bouton X, « se connecter », « payer ».
  // Un tiroir n'est donc pas un raccourci cosmétique : c'est ce qui permet de
  // vérifier son panier au milieu d'un achat sans perdre la page.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param cartMode true → panier proxy AYWEBs ; false → favoris du compte.
   */
  private void openListSheet(final boolean cartMode) {
    final Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.sheet_aywebs_list);

    final TextView title = dialog.findViewById(R.id.aywebs_sheet_title);
    final ImageButton close = dialog.findViewById(R.id.aywebs_sheet_close);
    final ProgressBar busy = dialog.findViewById(R.id.aywebs_sheet_progress);
    final TextView notice = dialog.findViewById(R.id.aywebs_sheet_notice);
    final LinearLayout list = dialog.findViewById(R.id.aywebs_sheet_list);
    final TextView total = dialog.findViewById(R.id.aywebs_sheet_total);
    final Button cta = dialog.findViewById(R.id.aywebs_sheet_cta);
    final Button keepShopping = dialog.findViewById(R.id.aywebs_sheet_continue);

    title.setText(cartMode ? R.string.aywebs_cart : R.string.aywebs_wish);
    // Fermer le tiroir == revenir à la page marchande, jamais finish().
    close.setOnClickListener(v -> dialog.dismiss());
    keepShopping.setOnClickListener(v -> dialog.dismiss());

    showAyWebsSheetDialog(dialog);
    capSheetHeight(dialog);

    if (apiOrigin.isEmpty()) {
      busy.setVisibility(View.GONE);
      notice.setText(R.string.aywebs_sheet_failed);
      notice.setVisibility(View.VISIBLE);
      return;
    }

    final String endpoint = apiOrigin + (cartMode ? CART_PATH : FAVORITES_PATH);
    executor.execute(() -> {
      try {
        final JSONObject reply = get(endpoint, !cartMode);
        runOnUiThread(() -> {
          if (!dialog.isShowing()) return;
          busy.setVisibility(View.GONE);
          if (cartMode) {
            renderCartSheet(dialog, reply, list, notice, total, cta);
          } else {
            renderWishSheet(dialog, reply, list, notice);
            addFavoriteCurrentPageButton(dialog, list, notice);
          }
        });
      } catch (final AyWebsApiException error) {
        runOnUiThread(() -> {
          if (!dialog.isShowing()) return;
          busy.setVisibility(View.GONE);
          // 401 : ce n'est pas une panne. Les favoris vivent dans un compte ;
          // on le DIT, et on offre la seule sortie qui débloque la situation.
          if (error.status == 401 || error.status == 403) {
            notice.setText(R.string.aywebs_sheet_login_required);
            notice.setVisibility(View.VISIBLE);
            cta.setText(R.string.aywebs_sheet_login);
            cta.setVisibility(View.VISIBLE);
            // ── Remarque du 04/10/2026 ─────────────────────────────────────
            // Ce bouton appelait openWebRoute("/account") : se connecter
            // faisait donc QUITTER la boutique, en plein achat, pour la seule
            // raison qu'on voulait voir ses favoris. La connexion se fait
            // désormais dans une feuille par-dessus le tiroir ; on revient au
            // tiroir rempli, sans avoir bougé.
            cta.setOnClickListener(v -> openLoginSheet(() -> {
              dialog.dismiss();
              openListSheet(cartMode);
            }));
            return;
          }
          String message = error.getMessage();
          notice.setText(message == null || message.isEmpty()
              ? getString(R.string.aywebs_sheet_failed) : message);
          notice.setVisibility(View.VISIBLE);
        });
      } catch (final Exception error) {
        runOnUiThread(() -> {
          if (!dialog.isShowing()) return;
          busy.setVisibility(View.GONE);
          notice.setText(R.string.aywebs_sheet_failed);
          notice.setVisibility(View.VISIBLE);
        });
      }
    });
  }

  /** §7 : un tiroir ne dépasse jamais 82 % de l'écran, il défile à l'intérieur. */
  private void capSheetHeight(Dialog dialog) {
    android.view.Window window = dialog.getWindow();
    if (window == null) return;
    int screen = getResources().getDisplayMetrics().heightPixels;
    WindowManager.LayoutParams params = window.getAttributes();
    params.height = (int) (screen * 0.82f);
    window.setAttributes(params);
  }

  private void renderCartSheet(Dialog dialog, JSONObject reply, LinearLayout list,
      TextView notice, TextView total, Button cta) {
    JSONObject data = reply.optJSONObject("data");
    JSONArray items = data == null ? null : data.optJSONArray("items");
    if (items == null || items.length() == 0) {
      notice.setText(R.string.aywebs_sheet_empty_cart);
      notice.setVisibility(View.VISIBLE);
      return;
    }
    for (int index = 0; index < items.length(); index++) {
      JSONObject line = items.optJSONObject(index);
      if (line == null) continue;
      String variant = line.optString("variant_label", "");
      int quantity = line.optInt("quantity", 1);
      String subtitle = variant.isEmpty()
          ? getString(R.string.aywebs_sheet_quantity, quantity)
          : variant + " · " + getString(R.string.aywebs_sheet_quantity, quantity);
      JSONArray images = line.optJSONArray("images");
      addSheetRow(list,
          line.optString("title", ""),
          subtitle,
          money(line.optDouble("price_tnd", line.optDouble("unit_price", 0))) + " TND",
          images == null ? "" : images.optString(0, ""),
          null);
    }
    JSONObject totals = data.optJSONObject("totals");
    if (totals != null) {
      total.setText(getString(R.string.aywebs_sheet_total,
          money(totals.optDouble("product_subtotal_tnd", 0))));
      total.setVisibility(View.VISIBLE);
    }
    // Payer EST une sortie assumée : le client l'a explicitement autorisée.
    cta.setText(R.string.aywebs_sheet_checkout);
    cta.setVisibility(View.VISIBLE);
    cta.setOnClickListener(v -> { dialog.dismiss(); openWebRoute("/aywebs/cart"); });
  }

  private void renderWishSheet(Dialog dialog, JSONObject reply, LinearLayout list, TextView notice) {
    JSONArray items = reply.optJSONArray("data");
    if (items == null || items.length() == 0) {
      notice.setText(R.string.aywebs_sheet_empty_wish);
      notice.setVisibility(View.VISIBLE);
      items = new JSONArray();
    }
    for (int index = 0; index < items.length(); index++) {
      JSONObject favorite = items.optJSONObject(index);
      if (favorite == null) continue;
      final String target = favorite.optString("source_url", "");
      double price = favorite.optDouble("price_tnd", 0);
      addSheetRow(list,
          favorite.optString("title", ""),
          Uri.parse(target).getHost() == null ? "" : Uri.parse(target).getHost(),
          price > 0 ? money(price) + " TND" : "",
          favorite.optString("image_url", ""),
          // Ouvrir un favori recharge la WebView COURANTE : on change de page
          // marchande sans jamais sortir du navigateur de la boutique.
          target.isEmpty() ? null : v -> { dialog.dismiss(); if (ApiTrust.browsable(target)) webView.loadUrl(target); });
    }
  }

  /**
   * ── Remarque du 04/10/2026 ─────────────────────────────────────────────────
   * « تفضيلات تكون للمنتج لواقفين عليه » — le tiroir ne savait que LISTER. Or
   * on ouvre ses favoris en regardant un produit, précisément parce qu'on veut
   * l'y mettre. Ce bouton ajoute la page COURANTE, et il n'apparaît que si le
   * serveur a classé cette page comme une fiche produit : proposer d'ajouter
   * une page d'accueil aux favoris serait une promesse creuse.
   */
  private void addFavoriteCurrentPageButton(Dialog dialog, LinearLayout list, TextView notice) {
    Button add = new Button(this);
    add.setText(R.string.aywebs_fav_add);
    add.setAllCaps(false);
    add.setTextColor(0xFF1D3F8F);
    add.setBackgroundColor(0x00000000);
    add.setOnClickListener(v -> {
      if (!productPage || currentUrl.isEmpty()) {
        toast(R.string.aywebs_fav_not_product);
        return;
      }
      add.setEnabled(false);
      final String target = currentUrl;
      final String label = webView.getTitle() == null ? target : webView.getTitle();
      executor.execute(() -> {
        try {
          JSONObject body = new JSONObject().put("sourceUrl", target).put("title", label);
          postJson(apiOrigin + FAVORITES_PATH, body, true);
          runOnUiThread(() -> {
            toast(R.string.aywebs_fav_added);
            dialog.dismiss();
            openListSheet(false);
          });
        } catch (AyWebsApiException error) {
          runOnUiThread(() -> {
            add.setEnabled(true);
            if (error.status == 401 || error.status == 403) {
              openLoginSheet(() -> { dialog.dismiss(); openListSheet(false); });
              return;
            }
            notice.setText(R.string.aywebs_sheet_failed);
            notice.setVisibility(View.VISIBLE);
          });
        } catch (Exception error) {
          runOnUiThread(() -> {
            add.setEnabled(true);
            notice.setText(R.string.aywebs_sheet_failed);
            notice.setVisibility(View.VISIBLE);
          });
        }
      });
    });
    list.addView(add, 0);
  }

  /**
   * Connexion PAR-DESSUS le tiroir. Deux champs, un appel, et on revient
   * exactement là où on était. L'alternative — renvoyer vers l'écran compte —
   * détruisait la boutique au milieu d'un achat : c'est le reproche du client.
   */
  private void openLoginSheet(Runnable onSuccess) {
    final Dialog dialog = new Dialog(this);
    dialog.setContentView(R.layout.sheet_aywebs_login);
    final android.widget.EditText email = dialog.findViewById(R.id.aywebs_login_email);
    final android.widget.EditText password = dialog.findViewById(R.id.aywebs_login_password);
    final TextView error = dialog.findViewById(R.id.aywebs_login_error);
    final Button submit = dialog.findViewById(R.id.aywebs_login_submit);
    dialog.findViewById(R.id.aywebs_login_close).setOnClickListener(v -> dialog.dismiss());

    submit.setOnClickListener(v -> {
      final String mail = email.getText().toString().trim();
      final String secret = password.getText().toString();
      if (mail.isEmpty() || secret.isEmpty()) return;
      submit.setEnabled(false);
      error.setVisibility(View.GONE);
      executor.execute(() -> {
        try {
          JSONObject body = new JSONObject().put("email", mail).put("password", secret);
          JSONObject reply = postJson(apiOrigin + LOGIN_PATH, body, false);
          JSONObject data = reply.optJSONObject("data");
          // Le jeton natif n'est émis que pour la coque (en-tête
          // x-ayrovi-native) : c'est lui qui rend les favoris lisibles ici.
          String token = data == null ? "" : data.optString("native_session_token", "");
          if (token.isEmpty()) throw new AyWebsApiException(401, "");
          customerToken = token;
          NativeSession.write(this, token);
          runOnUiThread(() -> { dialog.dismiss(); if (onSuccess != null) onSuccess.run(); });
        } catch (Exception failure) {
          runOnUiThread(() -> {
            submit.setEnabled(true);
            String message = failure.getMessage();
            error.setText(message == null || message.isEmpty()
                ? getString(R.string.aywebs_login_failed) : message);
            error.setVisibility(View.VISIBLE);
          });
        }
      });
    });
    showAyWebsSheetDialog(dialog);
  }

  /** POST JSON ; `withCustomer` ajoute le porteur de session COMPTE. */
  private JSONObject postJson(String endpoint, JSONObject body, boolean withCustomer) throws Exception {
    HttpURLConnection connection = ApiTrust.open(endpoint);
    connection.setRequestMethod("POST");
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(60_000);
    connection.setRequestProperty("content-type", "application/json");
    // Sans cet en-tête le serveur n'émet PAS de jeton natif : la coque
    // resterait déconnectée après une connexion pourtant réussie.
    connection.setRequestProperty("x-ayrovi-native", "1");
    if (!sessionId.isEmpty()) connection.setRequestProperty("x-session-id", sessionId);
    customerToken = NativeSession.read(this);
    if (withCustomer && !customerToken.isEmpty()) {
      connection.setRequestProperty("authorization", "Bearer " + customerToken);
    }
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
      while ((read = stream.read(chunk)) > 0) {
        if (buffer.size() + read > 2_000_000) { connection.disconnect(); throw new java.io.IOException("RESPONSE_TOO_LARGE"); }
        buffer.write(chunk, 0, read);
      }
      stream.close();
    }
    connection.disconnect();
    String text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    if (code >= 300) throw new AyWebsApiException(code, userMessageOf(text));
    return new JSONObject(text);
  }

  private void addSheetRow(LinearLayout list, String title, String subtitle, String amount,
      String imageUrl, View.OnClickListener onClick) {
    View row = getLayoutInflater().inflate(R.layout.row_aywebs_line, list, false);
    ((TextView) row.findViewById(R.id.aywebs_line_title)).setText(title);
    TextView subtitleView = row.findViewById(R.id.aywebs_line_subtitle);
    subtitleView.setText(subtitle);
    subtitleView.setVisibility(subtitle == null || subtitle.isEmpty() ? View.GONE : View.VISIBLE);
    TextView amountView = row.findViewById(R.id.aywebs_line_amount);
    amountView.setText(amount);
    amountView.setVisibility(amount == null || amount.isEmpty() ? View.GONE : View.VISIBLE);
    if (imageUrl != null && !imageUrl.isEmpty()) {
      loadThumb(row.findViewById(R.id.aywebs_line_image), imageUrl);
    }
    if (onClick != null) row.setOnClickListener(onClick);
    else row.setClickable(false);
    list.addView(row);
  }

  /**
   * Réveil silencieux du service. Aucun effet visible, aucune donnée
   * affichée : on ne fait que payer le démarrage à froid pendant que
   * l'utilisateur parcourt la boutique. Un échec ici ne change rien — le
   * parcours normal reprend la main.
   */
  private void warmUpApi() {
    if (apiOrigin.isEmpty()) return;
    executor.execute(() -> {
      try {
        HttpURLConnection connection = ApiTrust.open(apiOrigin + HEALTH_PATH);
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.getResponseCode();
        connection.disconnect();
      } catch (Exception ignored) {
        /* le réveil est un confort, jamais une condition */
      }
    });
  }

  /** Lecture simple ; `withCustomer` ajoute le porteur de session COMPTE. */
  private JSONObject get(String endpoint, boolean withCustomer) throws Exception {
    HttpURLConnection connection = ApiTrust.open(endpoint);
    connection.setRequestMethod("GET");
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(60_000);
    connection.setRequestProperty("accept", "application/json");
    if (!sessionId.isEmpty()) connection.setRequestProperty("x-session-id", sessionId);
    customerToken = NativeSession.read(this);
    if (withCustomer && !customerToken.isEmpty()) {
      connection.setRequestProperty("authorization", "Bearer " + customerToken);
    }
    int code = connection.getResponseCode();
    InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    if (stream != null) {
      byte[] chunk = new byte[8192];
      int read;
      while ((read = stream.read(chunk)) > 0) {
        if (buffer.size() + read > 2_000_000) { connection.disconnect(); throw new java.io.IOException("RESPONSE_TOO_LARGE"); }
        buffer.write(chunk, 0, read);
      }
      stream.close();
    }
    connection.disconnect();
    String text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    if (code >= 300) throw new AyWebsApiException(code, userMessageOf(text));
    return new JSONObject(text);
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

  /**
   * ── Mesuré le 04/10/2026 : « وقت طويل … وطلعلك كلمة timeout » ─────────────
   * L'hébergement met le service en veille après inactivité. Le premier appel
   * doit donc le RÉVEILLER, et ce réveil prend couramment 50 à 60 secondes —
   * chronométré : un simple GET a mis 65 s. Or le lecteur était fixé à 20 s :
   * l'ajout au panier ne pouvait QUE expirer, toujours, sur le premier produit
   * de la session. Ce n'était pas un défaut d'Amazon ni du produit.
   *
   * Deux corrections, pas une : des délais à la mesure du réveil (ci-dessous),
   * et un réveil DÉCLENCHÉ À L'OUVERTURE du navigateur marchand (warmUp), pour
   * que le service soit déjà debout quand l'utilisateur atteint une fiche.
   * Une seule relance automatique : au-delà, c'est une vraie panne, et
   * réessayer en boucle ne ferait que prolonger l'attente en silence.
   */
  private JSONObject post(String endpoint, JSONObject body) throws Exception {
    try {
      return postOnce(endpoint, body);
    } catch (java.net.SocketTimeoutException firstTimeout) {
      // Le réveil est en cours : la seconde tentative tombe sur un service
      // debout et aboutit normalement.
      return postOnce(endpoint, body);
    }
  }

  private JSONObject postOnce(String endpoint, JSONObject body) throws Exception {
    HttpURLConnection connection = ApiTrust.open(endpoint);
    connection.setRequestMethod("POST");
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(60_000);
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
      while ((read = stream.read(chunk)) > 0) {
        if (buffer.size() + read > 2_000_000) { connection.disconnect(); throw new java.io.IOException("RESPONSE_TOO_LARGE"); }
        buffer.write(chunk, 0, read);
      }
      stream.close();
    }
    connection.disconnect();
    String text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    if (code >= 300) {
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
    /** Le STATUT est conservé : 401 n'est pas une panne, c'est « connectez-vous ». */
    final int status;

    AyWebsApiException(int status, String userMessage) {
      super(userMessage == null || userMessage.isEmpty() ? "AYWEBS_HTTP_" + status : userMessage);
      this.status = status;
    }
  }

  @Override
  protected void onDestroy() {
    executor.shutdownNow();
    if (webView != null) webView.destroy();
    super.onDestroy();
  }
}
