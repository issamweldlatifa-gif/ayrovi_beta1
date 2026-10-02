package app.ayrovi.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AYWEBs §9 — couche de navigation marchande interne (expérience type Buyee).
 *
 * Rôle exact de la coque : afficher la page du marchand DANS l'application avec
 * une barre d'outils (fermer, URL, actualiser, précédent, suivant, panier,
 * ajouter) et un bouton « AyWebs + » injecté sur les fiches produit. Tout le
 * reste est décidé par le serveur :
 *
 *  - la classification de la page (produit ? connexion requise ? captcha ?)
 *    vient de `POST {origine}/api/v1/aywebs/page/analyze` (§11) ;
 *  - l'ajout au panier n'existe JAMAIS ici : le bouton renvoie vers la route
 *    web `/aywebs/product?url=…` via le lien profond §25 de la MainActivity, et
 *    c'est la session web — seule détentrice du panier et des montants (§45) —
 *    qui résout le produit, les variantes et l'ajout (§13, §16) ;
 *  - une page exigeant connexion / vérification / captcha désactive le bouton
 *    et affiche l'avis §27 : AYROVI ne contourne jamais le marchand.
 *
 * Aucune origine n'est codée en dur : elle arrive de la configuration Capacitor
 * (transmise par {@link AyWebsBrowsePlugin}), comme dans la MainActivity (§25).
 * Aucune décision de montant, de stock ou d'achat n'apparaît dans ce fichier.
 */
public class AyWebsBrowseActivity extends Activity {

  public static final String EXTRA_SESSION_ID = "aywebs_session_id";
  public static final String EXTRA_WEB_BASE = "aywebs_web_base";

  private static final String ANALYZE_PATH = "/api/v1/aywebs/page/analyze";
  private static final String CART_PATH = "/api/v1/aywebs/cart";
  private static final String CAPTURE_BUTTON_ID = "aywebs-capture-btn";

  /** Bouton flottant injecté UNIQUEMENT sur une fiche produit détectée (§12). */
  private static final String INJECT_CAPTURE_BUTTON =
      "(function(){if(document.getElementById('" + CAPTURE_BUTTON_ID + "'))return;"
          + "var b=document.createElement('button');"
          + "b.id='" + CAPTURE_BUTTON_ID + "';b.type='button';"
          + "b.setAttribute('aria-label','Ajouter au panier AyWebs');"
          + "b.style.cssText='position:fixed;right:14px;bottom:92px;z-index:2147483647;"
          + "min-width:56px;height:56px;padding:0 14px;border-radius:9999px;border:0;"
          + "background:#f97316;color:#ffffff;font:700 13px/1.2 system-ui,sans-serif;"
          + "box-shadow:0 10px 26px rgba(0,0,0,.38);display:flex;align-items:center;"
          + "justify-content:center;cursor:pointer;';"
          + "b.textContent='AyWebs +';"
          + "b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();"
          + "if(window.AyWebsBridge){AyWebsBridge.requestCapture();}});"
          + "(document.body||document.documentElement).appendChild(b);})();";

  private static final String REMOVE_CAPTURE_BUTTON =
      "(function(){var b=document.getElementById('" + CAPTURE_BUTTON_ID + "');"
          + "if(b&&b.parentNode){b.parentNode.removeChild(b);}})();";

  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  private WebView webView;
  private ProgressBar progress;
  private TextView urlLabel;
  private TextView notice;
  private TextView cartBadge;
  private ImageButton backButton;
  private ImageButton forwardButton;
  private Button addButton;

  private String sessionId = "";
  private String webBase = "";
  private String classifiedUrl = "";

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_aywebs_browse);

    sessionId = getStringExtra(EXTRA_SESSION_ID);
    webBase = normalizedBase(getStringExtra(EXTRA_WEB_BASE));

    webView = findViewById(R.id.aywebs_webview);
    progress = findViewById(R.id.aywebs_progress);
    urlLabel = findViewById(R.id.aywebs_url);
    notice = findViewById(R.id.aywebs_notice);
    cartBadge = findViewById(R.id.aywebs_cart_badge);
    backButton = findViewById(R.id.aywebs_back);
    forwardButton = findViewById(R.id.aywebs_forward);
    addButton = findViewById(R.id.aywebs_add);

    configureWebView();

    findViewById(R.id.aywebs_close).setOnClickListener(view -> finish());
    findViewById(R.id.aywebs_refresh).setOnClickListener(view -> webView.reload());
    backButton.setOnClickListener(view -> {
      if (webView.canGoBack()) {
        webView.goBack();
      }
    });
    forwardButton.setOnClickListener(view -> {
      if (webView.canGoForward()) {
        webView.goForward();
      }
    });
    findViewById(R.id.aywebs_cart).setOnClickListener(view -> handoff("cart", null));
    addButton.setOnClickListener(view -> handoff("product", webView.getUrl()));

    Uri target = getIntent() == null ? null : getIntent().getData();
    if (target == null || webBase.isEmpty()) {
      finish();
      return;
    }
    webView.loadUrl(target.toString());
  }

  /** Durcissement WebView : le marchand s'exécute, la coque ne s'expose pas. */
  private void configureWebView() {
    WebSettings settings = webView.getSettings();
    // Indispensable aux sites marchands modernes ; encadré ci-dessous.
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setSupportMultipleWindows(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setGeolocationEnabled(false);

    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);

    // Le bouton injecté parle à la coque ; rien d'autre n'est exposé au JS marchand.
    webView.addJavascriptInterface(new CaptureBridge(), "AyWebsBridge");

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public void onPageFinished(WebView view, String url) {
        urlLabel.setText(view.getUrl());
        updateNavigationButtons();
        classify(view.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();
        if (scheme == null) {
          return true;
        }
        if ("ayrovi".equalsIgnoreCase(scheme)) {
          openInMainApp(uri);
          finish();
          return true;
        }
        // http(s) restent dans la vue ; tel:, mailto:, intent:, file: sont bloqués.
        return !"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme);
      }
    });

    webView.setWebChromeClient(new android.webkit.WebChromeClient() {
      @Override
      public void onProgressChanged(WebView view, int newProgress) {
        progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        progress.setProgress(newProgress);
      }
    });
  }

  /**
   * Classification SERVEUR de la page courante (§11). Le résultat ne fait que
   * piloter l'affichage : bouton injecté + CTA sur fiche produit détectée et
   * capture autorisée, avis §27 si le marchand exige une action client.
   */
  private void classify(String url) {
    if (url == null || url.isEmpty() || url.equals(classifiedUrl) || webBase.isEmpty()) {
      return;
    }
    classifiedUrl = url;
    String requestUrl = url;
    executor.execute(() -> {
      boolean productDetected = false;
      boolean captureAllowed = false;
      boolean actionRequired = false;
      try {
        JSONObject body = new JSONObject();
        body.put("url", requestUrl);
        JSONObject data = postJson(webBase + ANALYZE_PATH, body);
        if (data != null) {
          productDetected = data.optBoolean("product_detected", false);
          captureAllowed = data.optBoolean("capture_allowed", false);
          String action = data.optString("customer_action_required", "NONE");
          actionRequired = action != null && !"NONE".equals(action);
        }
      } catch (Exception ignored) {
        // Réseau / analyse indisponible : aucune détection affirmée (§48).
        productDetected = false;
        captureAllowed = false;
        actionRequired = false;
      }
      final boolean product = productDetected && captureAllowed;
      final boolean locked = actionRequired;
      runOnUiThread(() -> applyClassification(requestUrl, product, locked));
    });
  }

  private void applyClassification(String url, boolean productPage, boolean actionRequired) {
    if (!url.equals(webView.getUrl())) {
      return; // la page a déjà changé : décision obsolète
    }
    notice.setVisibility(actionRequired ? View.VISIBLE : View.GONE);
    addButton.setEnabled(productPage && !actionRequired);
    addButton.setAlpha(productPage && !actionRequired ? 1f : 0.45f);
    webView.evaluateJavascript(productPage && !actionRequired ? INJECT_CAPTURE_BUTTON : REMOVE_CAPTURE_BUTTON, null);
  }

  /** Compteur du panier AYWEBs (session web) pour la pastille de la barre. */
  private void refreshCartBadge() {
    if (webBase.isEmpty()) {
      return;
    }
    executor.execute(() -> {
      int count = 0;
      try {
        JSONObject payload = getJson(webBase + CART_PATH);
        if (payload != null) {
          JSONArray items = payload.optJSONArray("items");
          count = items == null ? 0 : items.length();
        }
      } catch (Exception ignored) {
        count = 0;
      }
      final int shown = count;
      runOnUiThread(() -> {
        cartBadge.setVisibility(shown > 0 ? View.VISIBLE : View.GONE);
        cartBadge.setText(String.valueOf(shown));
      });
    });
  }

  /**
   * Renvoi vers l'application web via le lien profond §25 : la MainActivity
   * traduit `ayrovi://aywebs/…` en route web de la même origine. La coque ne
   * connaît ni panier, ni montants, ni variantes.
   */
  private void handoff(String section, String productUrl) {
    Uri.Builder deep = Uri.parse("ayrovi://aywebs/" + section).buildUpon();
    if (productUrl != null && !productUrl.isEmpty()) {
      deep.appendQueryParameter("url", productUrl);
    }
    openInMainApp(deep.build());
    finish();
  }

  private void openInMainApp(Uri deepLink) {
    Intent intent = new Intent(Intent.ACTION_VIEW, deepLink);
    intent.setPackage(getPackageName());
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    startActivity(intent);
  }

  private void updateNavigationButtons() {
    backButton.setEnabled(webView.canGoBack());
    backButton.setAlpha(webView.canGoBack() ? 1f : 0.35f);
    forwardButton.setEnabled(webView.canGoForward());
    forwardButton.setAlpha(webView.canGoForward() ? 1f : 0.35f);
  }

  private String getStringExtra(String key) {
    Intent intent = getIntent();
    String value = intent == null ? null : intent.getStringExtra(key);
    return value == null ? "" : value;
  }

  private String normalizedBase(String raw) {
    String trimmed = raw == null ? "" : raw.trim();
    while (trimmed.endsWith("/")) {
      trimmed = trimmed.substring(0, trimmed.length() - 1);
    }
    return trimmed;
  }

  private JSONObject postJson(String endpoint, JSONObject body) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
    try {
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(8000);
      connection.setReadTimeout(15000);
      connection.setRequestProperty("Content-Type", "application/json");
      if (!sessionId.isEmpty()) {
        connection.setRequestProperty("x-session-id", sessionId);
      }
      connection.setDoOutput(true);
      byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
      OutputStream out = connection.getOutputStream();
      out.write(payload);
      out.flush();
      out.close();
      return readDataObject(connection);
    } finally {
      connection.disconnect();
    }
  }

  private JSONObject getJson(String endpoint) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
    try {
      connection.setRequestMethod("GET");
      connection.setConnectTimeout(8000);
      connection.setReadTimeout(15000);
      if (!sessionId.isEmpty()) {
        connection.setRequestProperty("x-session-id", sessionId);
      }
      return readDataObject(connection);
    } finally {
      connection.disconnect();
    }
  }

  /** Lit `{ "success": true, "data": { … } }` et renvoie uniquement `data`. */
  private JSONObject readDataObject(HttpURLConnection connection) throws Exception {
    int status = connection.getResponseCode();
    InputStream stream = status >= 200 && status < 400
        ? connection.getInputStream()
        : connection.getErrorStream();
    if (stream == null) {
      return null;
    }
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    while ((read = stream.read(chunk)) != -1) {
      buffer.write(chunk, 0, read);
    }
    stream.close();
    JSONObject envelope = new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
    return envelope.optJSONObject("data");
  }

  /** Pont JS → coque : une seule méthode, traduction directe en lien profond. */
  private final class CaptureBridge {
    @JavascriptInterface
    public void requestCapture() {
      runOnUiThread(() -> handoff("product", webView.getUrl()));
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    refreshCartBadge();
  }

  @Override
  protected void onPause() {
    CookieManager.getInstance().flush();
    super.onPause();
  }

  @Override
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    executor.shutdownNow();
    if (webView != null) {
      webView.stopLoading();
      webView.destroy();
    }
    super.onDestroy();
  }
}
