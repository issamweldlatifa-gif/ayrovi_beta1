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

  private static final String ANALYZE_PATH = "/api/v1/aywebs/page/analyze";
  private static final String RESOLVE_PATH = "/api/v1/aywebs/product/resolve";
  private static final String CART_ITEMS_PATH = "/api/v1/aywebs/cart/items";

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

  /** §11 : la coque ne devine rien — le serveur classe la page. */
  private void analyze(String url) {
    executor.execute(() -> {
      try {
        JSONObject body = new JSONObject().put("url", url);
        JSONObject reply = post(webBase + ANALYZE_PATH, body);
        boolean isProduct = reply.optJSONObject("data") != null
            && reply.optJSONObject("data").optBoolean("is_product_page", false)
            && reply.optJSONObject("data").optBoolean("capture_allowed", false);
        setAddEnabled(isProduct);
      } catch (Exception error) {
        setAddEnabled(false);
      }
    });
  }

  /** §13/§15 : ajout réel — feuille de variantes par-dessus le marchand. */
  private void onAddToCart() {
    if (!productPage || currentUrl.isEmpty()) return;
    runOnUiThread(() -> addButton.setText(R.string.aywebs_loading));
    executor.execute(() -> {
      try {
        JSONObject body = new JSONObject().put("url", currentUrl);
        JSONObject reply = post(webBase + RESOLVE_PATH, body);
        JSONObject product = reply.optJSONObject("data");
        runOnUiThread(() -> {
          if (product == null) {
            addButton.setText(R.string.aywebs_add_to_cart);
            return;
          }
          showVariantSheet(product);
        });
      } catch (Exception error) {
        runOnUiThread(() -> addButton.setText(R.string.aywebs_add_to_cart));
      }
    });
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
        executor.execute(() -> {
          try {
            post(webBase + CART_ITEMS_PATH, body);
            runOnUiThread(() -> showAddedDialog(product.optString("title", "")));
          } catch (Exception error) {
            runOnUiThread(() -> addButton.setText(R.string.aywebs_add_to_cart));
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
    Intent intent = new Intent(this, MainActivity.class);
    intent.setData(Uri.parse(webBase + route));
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
    if (code >= 400) throw new Exception("AYWEBS_HTTP_" + code);
    return new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
  }

  @Override
  protected void onDestroy() {
    executor.shutdownNow();
    if (webView != null) webView.destroy();
    super.onDestroy();
  }
}
