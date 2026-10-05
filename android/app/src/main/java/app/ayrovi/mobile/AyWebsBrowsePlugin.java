package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont AYWEBs §9 — ouverture du navigateur marchand natif depuis le web.
 * Aucune logique métier : validation http(s) puis transmission de l'URL et de
 * la session WEB (le panier reste serveur, §45). Hors coque : repli onglet
 * externe côté client (§2).
 */
@CapacitorPlugin(name = "AyWebsBrowse")
public class AyWebsBrowsePlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    if (android.os.Build.VERSION.SDK_INT < 28) {
      call.reject("ISOLATED_WEBVIEW_REQUIRES_ANDROID_9"); return;
    }
    String url = call.getString("url", "");
    String sessionId = call.getString("sessionId", "");
    // Jeton de session CLIENT (04/10/2026) : le tiroir « Favoris » du
    // navigateur marchand lit /api/customer/account/favorites, qui appartient
    // au COMPTE et non à la session panier. Sans lui, un utilisateur pourtant
    // connecté verrait « connectez-vous » au milieu de ses achats.
    String customerToken = call.getString("customerToken", "");

    String apiOrigin = BuildConfig.AYROVI_API_ORIGIN;
    if (!ApiTrust.sameOrigin(apiOrigin, BuildConfig.AYROVI_API_ORIGIN)) {
      call.reject("UNTRUSTED_API_ORIGIN"); return;
    }
    if (!ApiTrust.browsable(url)) {
      call.reject("HTTPS_MERCHANT_URL_REQUIRED"); return;
    }
    Uri parsed = Uri.parse(url);

    String base = getBridge() == null ? null : getBridge().getServerUrl();
    if (base == null || base.trim().isEmpty()) base = "https://localhost";

    Intent intent = new Intent(getContext(), AyWebsBrowseActivity.class);
    intent.setData(parsed);
    intent.putExtra(AyWebsBrowseActivity.EXTRA_SESSION_ID, sessionId == null ? "" : sessionId);
    intent.putExtra(AyWebsBrowseActivity.EXTRA_WEB_BASE, base.trim());
    intent.putExtra(AyWebsBrowseActivity.EXTRA_API_ORIGIN, apiOrigin == null ? "" : apiOrigin);
    NativeSession.write(getContext(), customerToken);
    getContext().startActivity(intent);

    JSObject ret = new JSObject();
    ret.put("opened", true);
    call.resolve(ret);
  }
  @PluginMethod
  public void clearMerchantData(PluginCall call) {
    NativeSession.logout(getContext());
    if (android.os.Build.VERSION.SDK_INT >= 28) {
      getContext().startService(new Intent(getContext(), MerchantDataService.class));
    }
    call.resolve();
  }

}
