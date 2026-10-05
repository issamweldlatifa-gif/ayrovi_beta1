package app.ayrovi.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ApiTrustTest {
  @Test public void originComparison() {
    String origin = "https://api.ayrovi.example";
    assertTrue(ApiTrust.sameOrigin(origin + "/api/cart", origin));
    assertTrue(ApiTrust.sameOrigin(origin + ":443/api/cart", origin));
    for (String u : new String[]{"http://api.ayrovi.example", "https://api.ayrovi.example.evil", "https://sub.api.ayrovi.example", "https://api.ayrovi.example:444", "https://u:p@api.ayrovi.example", "file:///etc/passwd", "not a url"}) assertFalse(u, ApiTrust.sameOrigin(u, origin));
  }
  @Test public void schemesAndUserInfo() {
    assertTrue(ApiTrust.browsable("https://www.amazon.com/dp/B012345678"));
    for (String u : new String[]{"http://www.amazon.com", "file:///a", "content://x", "javascript:alert(1)", "intent://x", "data:text/html,x", "https://u@amazon.com", BuildConfig.AYROVI_API_ORIGIN}) assertFalse(u, ApiTrust.browsable(u));
  }
  @Test public void maliciousEndpointNeverConnects() {
    try { ApiTrust.open("https://attacker.example/api"); fail("must reject"); }
    catch (java.io.IOException expected) { assertEquals("UNTRUSTED_API_ORIGIN", expected.getMessage()); }
  }
}
