package app.ayrovi.mobile;

import java.net.URI;
import java.net.HttpURLConnection;
import java.io.IOException;

/** Native trust boundary: no JavaScript/Intent-selected API origins. */
final class ApiTrust {
  static boolean sameOrigin(String value, String trusted) {
    try {
      URI u = new URI(value), t = new URI(trusted);
      return "https".equalsIgnoreCase(u.getScheme()) && u.getUserInfo() == null
          && u.getHost() != null && u.getHost().equalsIgnoreCase(t.getHost())
          && (u.getPort() == -1 ? 443 : u.getPort()) == (t.getPort() == -1 ? 443 : t.getPort())
          && "https".equalsIgnoreCase(t.getScheme());
    } catch (Exception e) { return false; }
  }
  static HttpURLConnection open(String endpoint) throws IOException {
    if (!sameOrigin(endpoint, BuildConfig.AYROVI_API_ORIGIN)) throw new IOException("UNTRUSTED_API_ORIGIN");
    HttpURLConnection connection = (HttpURLConnection) new java.net.URL(endpoint).openConnection();
    connection.setInstanceFollowRedirects(false);
    return connection;
  }
  static boolean browsable(String value) {
    try {
      URI u = new URI(value);
      return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null
          && u.getUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443)
          && !u.getHost().equalsIgnoreCase("localhost")
          && !sameOrigin(value, BuildConfig.AYROVI_API_ORIGIN);
    } catch (Exception e) { return false; }
  }
}
