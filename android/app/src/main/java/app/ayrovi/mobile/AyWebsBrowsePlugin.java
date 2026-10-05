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
    // Jeton de session CLIENT (04/10/2026) : le tiroir « Favoris » du
    // navigateur marchand lit /api/customer/account/favorites, qui appartient
    // au COMPTE et non à la session panier. Sans lui, un utilisateur pourtant
    // connecté verrait « connectez-vous » au milieu de ses achats.
    String customerToken = call.getString("customerToken", "");

    // Origine de l'API, transmise par la couche web (SOURCE UNIQUE :
    // client/src/services/apiOrigin.ts). Ajouté le 2026-10-03 : les appels
    // privés de la coque (analyse de page, résolution, ajout au panier)
    // partaient vers `https://localhost` — l'origine du paquet embarqué, où
    // AUCUN serveur n'écoute. C'est la cause du bouton « Add to Cart » figé
    // sur « Loading… » et du message trompeur « Page non éligible ».
    // Validée ici : seules des origines http(s) absolues et sans espace sont
    // acceptées, sinon on retombe sur le comportement précédent.
    String apiOrigin = call.getString("apiOrigin", "");
    if (apiOrigin != null) {
      String candidate = apiOrigin.trim();
      if (candidate.regionMatches(true, 0, "https://", 0, 8)
          || candidate.regionMatches(true, 0, "http://", 0, 7)) {
        while (candidate.endsWith("/")) candidate = candidate.substring(0, candidate.length() - 1);
        apiOrigin = candidate;
      } else {
        apiOrigin = "";
      }
    }

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
    intent.putExtra(AyWebsBrowseActivity.EXTRA_API_ORIGIN, apiOrigin == null ? "" : apiOrigin);
    intent.putExtra(AyWebsBrowseActivity.EXTRA_CUSTOMER_TOKEN, customerToken == null ? "" : customerToken);
    getContext().startActivity(intent);

    JSObject ret = new JSObject();
    ret.put("opened", true);
    call.resolve(ret);
  }
}
