/**
 * Observateur réseau PASSIF en lecture seule injecté avant le chargement du
 * document WebView (`injectedJavaScriptBeforeContentLoaded`).
 *
 * Il mémorise dans un anneau borné (`window.__aywebsNetPayloads`, max 25 entrées
 * JSON/JSONP ≤ 650 Ko) les réponses produit / SKU / variantes / MTOP / BFF déjà
 * demandées par la boutique lors de l'ouverture initiale (Source #3 : `network_cache`
 * pour `AYWEBS_CAPTURE_SCRIPT`). Ne modifie aucun en-tête, cookie, jeton ni réponse.
 */
export const AYWEBS_NETWORK_OBSERVER_SCRIPT = `(function () {
  try {
    if (window.__aywebsNetObserverInstalled) return;
    window.__aywebsNetObserverInstalled = true;
    window.__aywebsNetPayloads = window.__aywebsNetPayloads || [];
    window.__aywebsLastTouchAt = window.__aywebsLastTouchAt || 0;
    try {
      var markTouch = function () { window.__aywebsLastTouchAt = Date.now(); };
      document.addEventListener('touchstart', markTouch, true);
      document.addEventListener('click', markTouch, true);
    } catch (e) {}
    var RELEVANT_URL = /product|goods|detail|sku|variant|twister|graphql|item|offer|price|pdp|realtime|mall|bff|mtop|bundle/i;
    var MAX_TEXT_LEN = 650000;
    var parseJsonOrJsonp = function (rawTxt) {
      if (!rawTxt || typeof rawTxt !== 'string') return null;
      var trimmed = rawTxt.replace(/^\\s+|\\s+$/g, '');
      if (!trimmed) return null;
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        try { return JSON.parse(trimmed); } catch (e) { return null; }
      }
      var m = trimmed.match(/^[a-zA-Z0-9_$.]+\\s*\\(\\s*(\\{[\\s\\S]*\\})\\s*\\)\\s*;?$/);
      if (m && m[1]) {
        try { return JSON.parse(m[1]); } catch (e2) { return null; }
      }
      return null;
    };
    var pushPayload = function (reqUrl, bodyObj) {
      try {
        if (!bodyObj || typeof bodyObj !== 'object') return;
        var list = window.__aywebsNetPayloads;
        if (!list) return;
        if (list.length >= 25) list.shift();
        list.push({ url: String(reqUrl || '').slice(0, 300), body: bodyObj, ts: Date.now() });
      } catch (e) {}
    };
    if (typeof window.fetch === 'function') {
      var origFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var reqUrl = '';
        try { reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''; } catch (e) {}
        var p = origFetch.apply(this, args);
        if (reqUrl && RELEVANT_URL.test(reqUrl) && p && typeof p.then === 'function') {
          p.then(function (res) {
            try {
              if (!res || !res.clone) return;
              var ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
              if (ct && ct.indexOf('json') < 0 && ct.indexOf('javascript') < 0 && ct.indexOf('text/plain') < 0) return;
              res.clone().text().then(function (txt) {
                if (!txt || txt.length > MAX_TEXT_LEN) return;
                var parsed = parseJsonOrJsonp(txt);
                if (parsed) pushPayload(reqUrl, parsed);
              })['catch'](function () {});
            } catch (e) {}
          })['catch'](function () {});
        }
        return p;
      };
    }
    if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype) {
      var origOpen = window.XMLHttpRequest.prototype.open;
      var origSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        try { this.__aywebsUrl = String(url || ''); } catch (e) {}
        return origOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        try {
          if (xhr.__aywebsUrl && RELEVANT_URL.test(xhr.__aywebsUrl) && xhr.addEventListener) {
            xhr.addEventListener('load', function () {
              try {
                if (xhr.responseType && xhr.responseType !== '' && xhr.responseType !== 'text' && xhr.responseType !== 'json') return;
                if (xhr.responseType === 'json' && xhr.response && typeof xhr.response === 'object') {
                  pushPayload(xhr.__aywebsUrl, xhr.response);
                  return;
                }
                var txt = typeof xhr.responseText === 'string' ? xhr.responseText : '';
                if (!txt || txt.length > MAX_TEXT_LEN) return;
                var parsed = parseJsonOrJsonp(txt);
                if (parsed) pushPayload(xhr.__aywebsUrl, parsed);
              } catch (e) {}
            });
          }
        } catch (e) {}
        return origSend.apply(this, arguments);
      };
    }
  } catch (e) {}
})();true;`;
