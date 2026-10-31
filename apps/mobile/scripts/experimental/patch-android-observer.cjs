#!/usr/bin/env node
/* EXPERIMENT ONLY. Do not wire into postinstall or production WebViews.
 * Patch an explicit copy of react-native-webview 13.17.0. The native client
 * selects one script using onPageStarted's URL, not asynchronous React state.
 * This preserves the library's existing injection timing; it does not provide
 * a documented document-start guarantee. */
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
if (!root) throw new Error('Pass the path of an isolated react-native-webview copy');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '13.17.0') throw new Error(`Unsupported react-native-webview version: ${pkg.version}`);
const folder = path.join(root, 'android/src/main/java/com/reactnativecommunity/webview');
const web = path.join(folder, 'RNCWebView.java');
const client = path.join(folder, 'RNCWebViewClient.java');
const originalWeb = fs.readFileSync(web, 'utf8');
const originalClient = fs.readFileSync(client, 'utf8');
const marker = 'AYWEBS_OBSERVER_V1:';
const oldMethod = `    public void callInjectedJavaScriptBeforeContentLoaded() {
        if (getSettings().getJavaScriptEnabled() &&
                injectedJSBeforeContentLoaded != null &&
                !TextUtils.isEmpty(injectedJSBeforeContentLoaded)) {
            evaluateJavascriptWithFallback("(function() {\\n" + injectedJSBeforeContentLoaded + ";\\n})();");
            injectJavascriptObject();  // re-inject the Javascript object in case it has been overwritten.
        }
    }`;
const newMethod = `    /** Experimental AYWEBs envelope: native code chooses exactly one script. */
    private @Nullable String aywebsObserverForPage(String source, String pageUrl) {
        if (!source.startsWith("${marker}")) return source;
        try {
            Uri uri = Uri.parse(pageUrl == null ? "" : pageUrl);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null || !(scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("http"))) return null;
            host = host.toLowerCase(java.util.Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
            JSONObject envelope = new JSONObject(source.substring("${marker}".length()));
            org.json.JSONArray domains = envelope.getJSONArray("amazonDomains");
            for (int i = 0; i < domains.length(); i++) {
                String domain = domains.getString(i).toLowerCase(java.util.Locale.ROOT);
                if (host.equals(domain) || host.endsWith("." + domain)) return envelope.getString("amazonScript");
            }
            return envelope.getString("legacyScript");
        } catch (Exception ignored) {
            return null; // fail closed: never evaluate the envelope as JavaScript
        }
    }

    public void callInjectedJavaScriptBeforeContentLoaded(String pageUrl) {
        if (getSettings().getJavaScriptEnabled() &&
                injectedJSBeforeContentLoaded != null &&
                !TextUtils.isEmpty(injectedJSBeforeContentLoaded)) {
            String selected = aywebsObserverForPage(injectedJSBeforeContentLoaded, pageUrl);
            if (!TextUtils.isEmpty(selected)) evaluateJavascriptWithFallback("(function() {\\n" + selected + ";\\n})();");
            injectJavascriptObject();
        }
    }`;
const oldCall = 'reactWebView.callInjectedJavaScriptBeforeContentLoaded();';
const newCall = 'reactWebView.callInjectedJavaScriptBeforeContentLoaded(url);';
if (originalWeb.includes(newMethod) && originalClient.includes(newCall) && !originalClient.includes(oldCall)) {
  console.log('Experimental patch already applied.');
  process.exit(0);
}
if (originalWeb.split(oldMethod).length !== 2 || originalClient.split(oldCall).length !== 2 || originalWeb.includes(marker)) {
  throw new Error('Unexpected WebView source: no files were changed.');
}
fs.writeFileSync(web, originalWeb.replace(oldMethod, newMethod));
fs.writeFileSync(client, originalClient.replace(oldCall, newCall));
console.log('Experimental Android observer patch applied.');
