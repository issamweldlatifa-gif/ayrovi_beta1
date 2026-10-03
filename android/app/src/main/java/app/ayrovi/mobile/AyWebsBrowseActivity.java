package app.ayrovi.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
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
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AYWEBs §9/§13/§15 — couche de navigation marchande interne (expérience type
 * Buyee) : le marchand s'affiche DANS l'app, et l'ajout au panier se fait SANS
 * quitter la page marchande.
 *
 * Flux exact, calqué sur un e-commerce réel :
 *  1. le client navigue chez le marchand ;
 *  2. « Add to Cart » (barre ou bouton injecté) passe en état de chargement ;
 *  3. le serveur résout le produit (`POST /product/resolve`, §11) ;
 *  4. si des variantes existent, une feuille de choix (§13) s'ouvre AU-DESSUS
 *     de la page marchande — jamais une fiche produit plein écran, jamais une
 *     sortie du magasin, l'état de navigation est conservé ;
 *  5. confirmation → `POST /cart/items` (§16) avec la session WEB : le panier,
 *     les montants et le devis restent propriété du serveur (§45) ;
 *  6. écran d'ajout : « Continuer mes achats » (retour au marchand, rien n'est
 *     rechargé) ou « Voir le panier » (lien profond §25 vers le panier web).
 *
 * La coque ne décide rien : classification, variantes, prix, disponibilité et
 * contrat d'erreur viennent du serveur ; une page exigeant connexion/captcha
 * désactive l'ajout et affiche l'avis §27. Aucune origine codée en dur (elle
 * vient de la config Capacitor via {@link AyWebsBrowsePlugin}), aucun montant
 * calculé en Java.
 */
public class AyWebsBrowseActivity extends Activity {

  public static final String EXTRA_SESSION_ID = "aywebs_session_id";
  public static final String EXTRA_WEB_BASE = "aywebs_web_base";

  private static final String ANALYZE_PATH = "/api/v1/aywebs/page/analyze";
  private static final String RESOLVE_PATH = "/api/v1/aywebs/product/resolve";
  private static final String CART_PATH = "/api/v1/aywebs/cart";
  private static final String CART_ITEMS_PATH = "/api/v1/aywebs/cart/items";
  private static final String CAPTURE_BUTTON_ID = "aywebs-capture-btn";

  /** Bouton « Add to Cart » injecté UNIQUEMENT sur fiche produit détectée (§12). */
  private static final String INJECT_CAPTURE_BUTTON =
      "(function(){if(document.getElementById('" + CAPTURE_BUTTON_ID + "'))return;"
          + "var b=document.createElement('button');"
          + "b.id='" + CAPTURE_BUTTON_ID + "';b.type='button';"
          + "b.setAttribute('aria-label','Ajouter au panier');"
          + "b.style.cssText='position:fixed;right:14px;bottom:92px;z-index:2147483647;"
          + "min-width:64px;height:52px;padding:0 18px;border-radius:9999px;border:0;"
          + "background:#f97316;color:#ffffff;font:700 14px/1.2 system-ui,sans-serif;"
          + "box-shadow:0 10px 26px rgba(0,0,0,.38);display:flex;align-items:center;"
          + "justify-content:center;cursor:pointer;';"
          + "b.textContent='Add to Cart';"
          + "b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();"
          + "if(window.AyWebsBridge){AyWebsBridge.requestCapture();}});"
          + "(document.body||document.documentElement).appendChild(b);})();";

  private static final String REMOVE_CAPTURE_BUTTON =
      "(function(){var b=document.getElementById('" + CAPTURE_BUTTON_ID + "');"
          + "if(b&&b.parentNode){b.parentNode.removeChild(b);}})();";

  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final Map<String, String> sheetSelection = new LinkedHashMap<>();

  private WebView webView;
  private ProgressBar progress;
  private TextView urlLabel;
  private TextView notice;
  private TextView cartBadge;
  private ImageButton backButton;
  private ImageButton forwardButton;
  private Button addButton;

  private Dialog sheetDialog;
  private JSONObject sheetProduct;
  private int sheetQuantity = 1;
  private boolean sheetBusy = false;

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
    addButton.setOnClickListener(view -> openAddFlow());

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

    CookieManager.getInstance().setAcceptCookie(true);

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
    runOnUiThread(() -> setAddLoading(true));
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
    boolean usable = productPage && !actionRequired;
    addButton.setEnabled(usable);
    addButton.setAlpha(usable ? 1f : 0.45f);
    addButton.setText(R.string.aywebs_add_to_cart);
    webView.evaluateJavascript(usable ? INJECT_CAPTURE_BUTTON : REMOVE_CAPTURE_BUTTON, null);
  }

  /** État « chargement » du CTA pendant l'analyse serveur : aucune navigation. */
  private void setAddLoading(boolean loading) {
    if (loading) {
      addButton.setEnabled(false);
      addButton.setAlpha(0.6f);
      addButton.setText(R.string.aywebs_loading);
    }
  }

  /* ------------------------------------------------------------------ *
   * Ajout au panier sans quitter le marchand (§13, §15, §16)
   * ------------------------------------------------------------------ */

  /** Pont JS → coque : le bouton injecté suit exactement le CTA de la barre. */
  private final class CaptureBridge {
    @JavascriptInterface
    public void requestCapture() {
      runOnUiThread(() -> openAddFlow());
    }
  }

  private void openAddFlow() {
    if (webBase.isEmpty() || !addButton.isEnabled() && sheetDialog == null) {
      return;
    }
    String url = webView.getUrl();
    if (url == null || url.isEmpty()) {
      return;
    }
    executor.execute(() -> {
      JSONObject product = null;
      String userMessage = null;
      try {
        JSONObject body = new JSONObject();
        body.put("url", url);
        body.put("quantity", 1);
        JSONObject envelope = postEnvelope(webBase + RESOLVE_PATH, body);
        if (envelope != null && envelope.optBoolean("success", false)) {
          product = envelope.optJSONObject("data");
        } else if (envelope != null) {
          userMessage = contractMessage(envelope);
        }
      } catch (Exception ignored) {
        userMessage = null;
      }
      final JSONObject resolved = product;
      final String message = userMessage;
      runOnUiThread(() -> {
        if (resolved != null) {
          showVariantSheet(resolved);
        } else {
          showSheetError(message);
        }
      });
    });
  }

  /** Feuille de choix AU-DESSUS de la page marchande : le contexte est conservé. */
  private void showVariantSheet(JSONObject product) {
    if (sheetDialog != null && sheetDialog.isShowing()) {
      return;
    }
    sheetProduct = product;
    sheetSelection.clear();
    sheetQuantity = 1;
    sheetBusy = false;

    Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
    dialog.setContentView(R.layout.dialog_aywebs_variant_sheet);
    if (dialog.getWindow() != null) {
      dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }
    dialog.setCancelable(true);

    TextView productLabel = dialog.findViewById(R.id.aywebs_sheet_product);
    productLabel.setText(product.optString("title", ""));
    ImageView thumb = dialog.findViewById(R.id.aywebs_sheet_thumb);
    String image = firstImage(product);
    if (image != null) {
      loadBitmap(image, thumb);
    }

    LinearLayout groups = dialog.findViewById(R.id.aywebs_sheet_groups);
    groups.removeAllViews();
    JSONArray variantGroups = product.optJSONArray("variant_groups");
    if (variantGroups != null) {
      for (int i = 0; i < variantGroups.length(); i++) {
        JSONObject group = variantGroups.optJSONObject(i);
        if (group == null) {
          continue;
        }
        String attribute = group.optString("attribute", "");
        JSONArray values = group.optJSONArray("values");
        if (attribute.isEmpty() || values == null || values.length() == 0) {
          continue;
        }
        TextView label = new TextView(this);
        label.setText(attribute);
        label.setTextColor(0xFF111827);
        label.setTextSize(13f);
        label.setTypeface(null, android.graphics.Typeface.BOLD);
        label.setPadding(0, 12, 0, 4);
        groups.addView(label);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        final String attr = attribute;
        final String[] options = new String[values.length()];
        final boolean[] dead = new boolean[values.length()];
        final Button[] buttons = new Button[values.length()];
        int firstLive = -1;
        for (int v = 0; v < values.length(); v++) {
          options[v] = values.optString(v, "");
          // §14/§13 : une version que le marchand déclare indisponible est
          // désactivée — jamais choisie par défaut, jamais ajoutable.
          dead[v] = isValueUnavailable(product, attr, options[v]);
          if (!dead[v] && firstLive < 0) {
            firstLive = v;
          }
          Button option = new Button(this);
          option.setText(options[v]);
          option.setAllCaps(false);
          option.setMinimumWidth(0);
          option.setPadding(24, 10, 24, 10);
          option.setEnabled(!dead[v]);
          option.setAlpha(dead[v] ? 0.35f : 1f);
          final int index = v;
          option.setOnClickListener(view -> {
            if (dead[index]) {
              return;
            }
            sheetSelection.put(attr, options[index]);
            for (int b = 0; b < buttons.length; b++) {
              styleOption(buttons[b], b == index);
            }
          });
          buttons[v] = option;
          row.addView(option);
        }
        // Sélection par défaut : première version DISPONIBLE (§13, §14).
        if (firstLive >= 0) {
          sheetSelection.put(attr, options[firstLive]);
          styleOption(buttons[firstLive], true);
          for (int b = 0; b < buttons.length; b++) {
            if (b != firstLive) {
              styleOption(buttons[b], false);
            }
          }
        }
        groups.addView(row);
      }
    }

    TextView quantity = dialog.findViewById(R.id.aywebs_sheet_qty);
    dialog.findViewById(R.id.aywebs_sheet_qty_minus).setOnClickListener(view -> {
      if (sheetQuantity > 1) {
        sheetQuantity--;
        quantity.setText(String.valueOf(sheetQuantity));
      }
    });
    dialog.findViewById(R.id.aywebs_sheet_qty_plus).setOnClickListener(view -> {
      if (sheetQuantity < 99) {
        sheetQuantity++;
        quantity.setText(String.valueOf(sheetQuantity));
      }
    });

    TextView error = dialog.findViewById(R.id.aywebs_sheet_error);
    Button add = dialog.findViewById(R.id.aywebs_sheet_add);

    JSONObject availability = product.optJSONObject("availability");
    String state = availability == null ? "" : availability.optString("state", "");
    if ("OUT_OF_STOCK".equals(state)) {
      add.setEnabled(false);
      add.setAlpha(0.45f);
      error.setVisibility(View.VISIBLE);
      error.setText(R.string.aywebs_out_of_stock);
    }

    add.setOnClickListener(view -> {
      if (sheetBusy) {
        return;
      }
      sheetBusy = true;
      add.setEnabled(false);
      add.setAlpha(0.6f);
      add.setText(R.string.aywebs_loading);
      error.setVisibility(View.GONE);
      confirmAdd(add, error, dialog);
    });

    dialog.findViewById(R.id.aywebs_sheet_close).setOnClickListener(view -> dialog.dismiss());
    dialog.findViewById(R.id.aywebs_sheet_continue).setOnClickListener(view -> dialog.dismiss());
    dialog.findViewById(R.id.aywebs_sheet_open_cart).setOnClickListener(view -> {
      dialog.dismiss();
      handoff("cart", null);
    });

    sheetDialog = dialog;
    dialog.show();
  }

  private void confirmAdd(Button addButtonView, TextView errorView, Dialog dialog) {
    JSONObject product = sheetProduct;
    if (product == null) {
      sheetBusy = false;
      return;
    }
    executor.execute(() -> {
      String itemNumber = null;
      String message = null;
      try {
        JSONObject body = new JSONObject();
        body.put("product_id", product.optString("product_id", ""));
        body.put("store_id", product.optString("store_id", ""));
        body.put("variant_attributes", sheetSelection.isEmpty() ? JSONObject.NULL : new JSONObject(sheetSelection));
        body.put("quantity", sheetQuantity);
        JSONObject envelope = postEnvelope(webBase + CART_ITEMS_PATH, body);
        if (envelope != null && envelope.optBoolean("success", false)) {
          JSONObject data = envelope.optJSONObject("data");
          JSONObject item = data == null ? null : data.optJSONObject("item");
          itemNumber = item == null ? null : item.optString("item_number", "");
        } else if (envelope != null) {
          message = contractMessage(envelope);
        }
      } catch (Exception ignored) {
        message = null;
      }
      final String addedRef = itemNumber;
      final String failure = message;
      runOnUiThread(() -> {
        sheetBusy = false;
        if (addedRef != null) {
          dialog.findViewById(R.id.aywebs_sheet_selection).setVisibility(View.GONE);
          View added = dialog.findViewById(R.id.aywebs_sheet_added);
          added.setVisibility(View.VISIBLE);
          TextView ref = dialog.findViewById(R.id.aywebs_sheet_added_ref);
          ref.setText(addedRef);
          refreshCartBadge();
        } else {
          addButtonView.setEnabled(true);
          addButtonView.setAlpha(1f);
          addButtonView.setText(R.string.aywebs_add_to_cart);
          errorView.setVisibility(View.VISIBLE);
          errorView.setText(failure == null ? getString(R.string.aywebs_retry_later) : failure);
        }
      });
    });
  }

  /** Erreur avant ouverture de feuille (resolve impossible) : avis honnête (§44). */
  private void showSheetError(String message) {
    Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
    dialog.setContentView(R.layout.dialog_aywebs_variant_sheet);
    if (dialog.getWindow() != null) {
      dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
    TextView error = dialog.findViewById(R.id.aywebs_sheet_error);
    error.setVisibility(View.VISIBLE);
    error.setText(message == null ? getString(R.string.aywebs_retry_later) : message);
    Button add = dialog.findViewById(R.id.aywebs_sheet_add);
    add.setEnabled(false);
    add.setAlpha(0.45f);
    dialog.findViewById(R.id.aywebs_sheet_close).setOnClickListener(view -> dialog.dismiss());
    dialog.findViewById(R.id.aywebs_sheet_continue).setOnClickListener(view -> dialog.dismiss());
    dialog.findViewById(R.id.aywebs_sheet_open_cart).setOnClickListener(view -> {
      dialog.dismiss();
      handoff("cart", null);
    });
    sheetDialog = dialog;
    dialog.show();
  }

  private void styleOption(Button button, boolean selected) {
    button.setBackgroundColor(selected ? 0xFFF97316 : 0xFFF3F4F6);
    button.setTextColor(selected ? 0xFFFFFFFF : 0xFF111827);
  }

  /**
   * Le marchand déclare-t-il cette version indisponible (§14) ? On ne l'affirme
   * que si le serveur a fourni des lignes de variantes explicites : sans
   * preuve, aucune option n'est inventée indisponible (§48).
   */
  private boolean isValueUnavailable(JSONObject product, String attribute, String value) {
    JSONArray variants = product.optJSONArray("variants");
    if (variants == null || variants.length() == 0) {
      return false;
    }
    boolean seen = false;
    for (int i = 0; i < variants.length(); i++) {
      JSONObject variant = variants.optJSONObject(i);
      if (variant == null || !variant.has("available")) {
        continue;
      }
      JSONObject attributes = variant.optJSONObject("attributes");
      if (attributes == null || !value.equals(attributes.optString(attribute, null))) {
        continue;
      }
      seen = true;
      if (variant.optBoolean("available", false)) {
        return false;
      }
    }
    return seen;
  }

  private String firstImage(JSONObject product) {
    JSONArray images = product.optJSONArray("images");
    return images == null ? null : images.optString(0, null);
  }

  private void loadBitmap(String url, ImageView target) {
    executor.execute(() -> {
      Bitmap bitmap = null;
      try {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(6000);
        connection.setReadTimeout(10000);
        InputStream stream = connection.getInputStream();
        bitmap = BitmapFactory.decodeStream(stream);
        stream.close();
        connection.disconnect();
      } catch (Exception ignored) {
        bitmap = null;
      }
      final Bitmap decoded = bitmap;
      if (decoded != null) {
        runOnUiThread(() -> target.setImageBitmap(decoded));
      }
    });
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
    JSONObject envelope = postEnvelope(endpoint, body);
    return envelope == null ? null : envelope.optJSONObject("data");
  }

  private JSONObject postEnvelope(String endpoint, JSONObject body) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
    try {
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(8000);
      connection.setReadTimeout(20000);
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
      return readEnvelope(connection);
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
      JSONObject envelope = readEnvelope(connection);
      return envelope == null ? null : envelope.optJSONObject("data");
    } finally {
      connection.disconnect();
    }
  }

  private JSONObject readEnvelope(HttpURLConnection connection) throws Exception {
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
    return new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
  }

  /** message utilisateur du contrat d'erreur (§44), jamais inventé. */
  private String contractMessage(JSONObject envelope) {
    JSONObject contract = envelope.optJSONObject("error_contract");
    if (contract != null && contract.has("userMessage")) {
      return contract.optString("userMessage", "");
    }
    return envelope.optString("error", "");
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
    if (sheetDialog != null && sheetDialog.isShowing()) {
      sheetDialog.dismiss();
      return;
    }
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    executor.shutdownNow();
    if (sheetDialog != null && sheetDialog.isShowing()) {
      sheetDialog.dismiss();
    }
    if (webView != null) {
      webView.stopLoading();
      webView.destroy();
    }
    super.onDestroy();
  }
}
