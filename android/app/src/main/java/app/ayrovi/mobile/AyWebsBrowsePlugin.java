package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont AYWEBs §9 — ouverture du navigateur marchand interne depuis le web.
 *
 * Le web demande, la coque exécute : aucune logique métier ici. On valide
 * uniquement que la cible est une URL http(s) affichable, puis on transmet
 * l'URL et l'identifiant de session WEB (la session du panier AYWEBs reste
 * celle du web, §45) à {@link AyWebsBrowseActivity}.
 *
 * Hors coque native le plugin n'existe pas : le web retombe sur un onglet
 * externe (comportement historique, §2 non destructif).
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
    if (base == null || base.trim().isEmpty()) {
      call.reject("WEB_BASE_UNAVAILABLE");
      return;
    }

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
