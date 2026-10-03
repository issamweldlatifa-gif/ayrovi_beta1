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
    String url = call.getString("url", "");
    String sessionId = call.getString("sessionId", "");
    Uri parsed = Uri.parse(url);
    String scheme = parsed.getScheme();
    if (scheme == null
        || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
      call.reject("URL_NOT_BROWSABLE");
      return;
    }

    String base = getBridge() == null ? null : getBridge().getServerUrl();
    if (base == null || base.trim().isEmpty()) base = "https://localhost";

    Intent intent = new Intent(getContext(), AyWebsBrowseActivity.class);
    intent.setData(parsed);
    intent.putExtra(AyWebsBrowseActivity.EXTRA_SESSION_ID, sessionId == null ? "" : sessionId);
    intent.putExtra(AyWebsBrowseActivity.EXTRA_WEB_BASE, base.trim());
    getContext().startActivity(intent);

    JSObject ret = new JSObject();
    ret.put("opened", true);
    call.resolve(ret);
  }
}
