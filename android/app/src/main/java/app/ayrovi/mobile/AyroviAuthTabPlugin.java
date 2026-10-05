package app.ayrovi.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.CancellationSignal;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.Executors;
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

  /**
   * Sélecteur de compte NATIF — la connexion « sans sortir », pour de vrai.
   *
   * ── Pourquoi cette méthode s'ajoute à l'onglet personnalisé ────────────────
   * L'onglet reste une page web : le client l'a lue comme « je quitte ». Ici
   * Android affiche sa propre feuille de comptes, par-dessus AYROVI ; aucune
   * page ne se charge, rien ne bascule. Le résultat est un jeton d'identité
   * signé par Google, que la couche web envoie à
   * POST /api/customer/auth/google/native pour vérification côté serveur.
   *
   * ── Ce que cette méthode ne peut pas faire seule ───────────────────────────
   * Elle exige un client OAuth de type Android déclaré chez Google avec le
   * SHA-1 du certificat de signature, et les services Google Play sur
   * l'appareil. Quand l'une des deux conditions manque, on ne simule rien :
   * on renvoie `available:false` et la couche web reprend l'onglet. Un échec
   * silencieux déguisé en succès serait pire que l'absence de la méthode.
   */
  @PluginMethod
  public void signInWithGoogle(PluginCall call) {
    String serverClientId = getContext().getString(R.string.google_web_client_id);
    if (serverClientId == null || serverClientId.trim().isEmpty()) {
      JSObject unavailable = new JSObject();
      unavailable.put("available", false);
      unavailable.put("reason", "NO_CLIENT_ID");
      call.resolve(unavailable);
      return;
    }

    // filterByAuthorizedAccounts(false) : le tout premier usage n'a encore
    // aucun compte « autorisé » pour cette application ; filtrer rendrait la
    // feuille vide et donnerait l'impression d'une panne.
    GetGoogleIdOption option = new GetGoogleIdOption.Builder()
        .setServerClientId(serverClientId)
        .setFilterByAuthorizedAccounts(false)
        .setAutoSelectEnabled(false)
        .build();
    GetCredentialRequest request = new GetCredentialRequest.Builder()
        .addCredentialOption(option)
        .build();

    CredentialManager manager = CredentialManager.create(getContext());
    manager.getCredentialAsync(
        getActivity(),
        request,
        new CancellationSignal(),
        Executors.newSingleThreadExecutor(),
        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
          @Override
          public void onResult(GetCredentialResponse response) {
            try {
              if (!(response.getCredential() instanceof CustomCredential)
                  || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                      .equals(response.getCredential().getType())) {
                throw new IllegalStateException("UNEXPECTED_CREDENTIAL");
              }
              GoogleIdTokenCredential credential =
                  GoogleIdTokenCredential.createFrom(((CustomCredential) response.getCredential()).getData());
              JSObject ok = new JSObject();
              ok.put("available", true);
              // Seul le jeton traverse : le serveur le fait valider par Google
              // avant d'ouvrir la moindre session. L'application ne décide de
              // rien ici, elle transporte.
              ok.put("idToken", credential.getIdToken());
              call.resolve(ok);
            } catch (Exception failure) {
              JSObject unusable = new JSObject();
              unusable.put("available", false);
              unusable.put("reason", "CREDENTIAL_UNUSABLE");
              call.resolve(unusable);
            }
          }

          @Override
          public void onError(GetCredentialException error) {
            // Pas de services Google Play, aucun compte sur l'appareil, SHA-1
            // non déclaré, ou simple annulation : dans tous ces cas la couche
            // web doit pouvoir retomber sur l'onglet, pas afficher une panne.
            JSObject unavailable = new JSObject();
            unavailable.put("available", false);
            unavailable.put("reason", error.getType());
            call.resolve(unavailable);
          }
        });
  }

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
