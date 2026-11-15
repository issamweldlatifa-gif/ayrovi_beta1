package app.zayrovi.mobile;

import android.app.Application;
import android.os.Build;
import android.webkit.WebView;

public class ZayroviApplication extends Application {
  @Override public void onCreate() {
    super.onCreate();
    if (Build.VERSION.SDK_INT >= 28 && Application.getProcessName().endsWith(":merchant")) {
      WebView.setDataDirectorySuffix("merchant");
    }
  }
}
