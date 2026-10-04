package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Connexion par fournisseur SANS quitter l'application (04/10/2026).
 *
 * ── La remarque ─────────────────────────────────────────────────────────────
 * « تسجيل دخول بش ولي داخل تطبيق لا خروج من تطبيق » : se connecter doit se
 * faire DANS l'application. Le correctif précédent du 404 Google passait par
 * `window.open`, que Capacitor délègue à Android : l'utilisateur basculait
 * dans Chrome, application séparée, pile de tâches séparée — il quittait
 * visiblement AYROVI et devait revenir à la main.
 *
 * ── Pourquoi un onglet personnalisé, et pas une WebView ─────────────────────
 * Charger le flux Google dans notre propre WebView n'est PAS une option : le
 * serveur d'autorisation Google refuse explicitement les WebView embarquées
 * (`disallowed_useragent`), précisément parce qu'une application hôte peut y
 * lire le mot de passe. Toute solution de ce genre finirait par un écran
 * d'erreur Google.
 *
 * L'onglet personnalisé (Custom Tab) est la réponse prévue pour ce cas : c'est
 * le moteur de Chrome, donc un agent utilisateur accepté et un vrai bac à
 * sable (AYROVI ne voit RIEN de ce qui y est tapé), mais il s'ouvre DANS notre
 * tâche, aux couleurs de l'application, et se referme tout seul au retour. Pas
 * de bascule d'application, pas de retour manuel.
 *
 * Si aucun navigateur compatible n'est installé, on ne ment pas : on répond
 * `opened:false` et la couche web retombe sur son comportement précédent.
 */
@CapacitorPlugin(name = "AyroviAuthTab")
public class AyroviAuthTabPlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url", "");
    Uri parsed = url == null ? null : Uri.parse(url.trim());
    String scheme = parsed == null ? null : parsed.getScheme();
    // Une seule origine est acceptable pour une page de mot de passe : https.
    if (parsed == null || !"https".equalsIgnoreCase(scheme == null ? "" : scheme)) {
      call.reject("AUTH_TAB_URL_INVALID");
      return;
    }

    JSObject result = new JSObject();
    try {
      CustomTabsIntent tab = new CustomTabsIntent.Builder()
          .setShowTitle(true)
          .setUrlBarHidingEnabled(false)
          .build();
      // FLAG_ACTIVITY_NEW_TASK est volontairement ABSENT : l'onglet doit rester
      // dans NOTRE tâche, sinon il devient une fenêtre séparée dans le sélecteur
      // d'applications — exactement ce que l'utilisateur nous reproche.
      tab.intent.putExtra(Intent.EXTRA_REFERRER,
          Uri.parse("android-app://" + getContext().getPackageName()));
      tab.launchUrl(getActivity(), parsed);
      result.put("opened", true);
    } catch (Exception error) {
      // Aucun navigateur compatible : la couche web reprend la main.
      result.put("opened", false);
    }
    call.resolve(result);
  }
}
