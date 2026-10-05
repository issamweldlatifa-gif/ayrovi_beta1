package app.ayrovi.mobile;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewDatabase;

/** Runs ONLY in the isolated merchant process. The durable marker also covers
 * process death before the asynchronous cookie clear has completed. */
public class MerchantDataService extends Service {
  @Override public IBinder onBind(Intent intent) { return null; }
  static void clear(android.content.Context context, Runnable done) {
    WebStorage.getInstance().deleteAllData();
    WebViewDatabase.getInstance(context).clearHttpAuthUsernamePassword();
    WebView w = new WebView(context); w.clearCache(true); w.destroy();
    CookieManager.getInstance().removeAllCookies(removed -> {
      CookieManager.getInstance().flush();
      NativeSession.clearMarker(context).delete();
      done.run();
    });
  }
  @Override public int onStartCommand(Intent intent, int flags, int id) {
    clear(this, () -> stopSelf(id));
    return START_NOT_STICKY;
  }
}
