/** Amazon-only passive observer. Independent from the legacy observer;
 * stores bounded page-request responses for the Amazon reader, without issuing requests. */
export const AMAZON_NETWORK_OBSERVER_SCRIPT = `(function () {
  try {
    var host = String(window.location && window.location.hostname || '').toLowerCase().replace(/\\.$/, '');
    var domains = ['amazon.fr','amazon.com','amazon.co.uk','amazon.de','amazon.it','amazon.es',
      'amazon.co.jp','amazon.ca','amazon.com.au','amazon.nl','amazon.se','amazon.pl',
      'amazon.com.tr','amazon.ae','amazon.sa','amazon.in','amazon.sg','amazon.com.mx',
      'amazon.com.br','amazon.eg','amazon.be'];
    var allowed = false;
    for (var d = 0; d < domains.length; d++) {
      if (host === domains[d] || host.slice(-(domains[d].length + 1)) === '.' + domains[d]) { allowed = true; break; }
    }
    if (!allowed) return;
    if (window.__aywebsNetObserverInstalled) return;
    window.__aywebsAmazonNetObserverInstalled = true;
    window.__aywebsNetObserverInstalled = true;
    window.__aywebsNetPayloads = window.__aywebsNetPayloads || [];
    window.__aywebsLastTouchAt = window.__aywebsLastTouchAt || 0;
    try {
      var markTouch = function () { window.__aywebsLastTouchAt = Date.now(); };
      document.addEventListener('click', markTouch, true);
    } catch (e) {}
    var RELEVANT_URL = /product|goods|detail|sku|variant|twister|graphql|item|offer|price|pdp|realtime|mall|bff|mtop|bundle|oak|poppy/i;
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
        if (!list || list.length >= 25) {
          if (list && list.length >= 25) list.shift();
          else return;
        }
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
              // A declared response over four bytes per permitted UTF-16 code
              // unit cannot fit the text limit. Avoid cloning it; otherwise
              // preserve the existing post-decode check (including unknown size).
              var encoding = String((res.headers && res.headers.get && res.headers.get('content-encoding')) || '').toLowerCase();
              var length = Number((res.headers && res.headers.get && res.headers.get('content-length')) || 0);
              if ((!encoding || encoding === 'identity') && isFinite(length) && length > MAX_TEXT_LEN * 4) return;
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
                  // Native JSON responses bypass responseText; enforce the same bound.
                  var jsonSize = JSON.stringify(xhr.response);
                  if (!jsonSize || jsonSize.length > MAX_TEXT_LEN) return;
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
