import type { AyWebsPageAnalysis } from '@/api/aywebs';

const MESSAGE = 'aywebs-product-surface';

export function canShowProductCapture(analysis: AyWebsPageAnalysis | null, onDemandConfirmed: boolean): boolean {
  if (!analysis || (!analysis.captureAllowed && !analysis.externalCaptureAllowed)) return false;
  if (analysis.captureInjection === 'on_demand') return onDemandConfirmed;
  return analysis.captureInjection !== 'never' && analysis.isProductPage;
}

export function parseProductSurfaceMessage(data: unknown): { nonce: number; url: string; product: boolean } | null {
  if (typeof data !== 'string' || data.length > 4600 || !data.includes(MESSAGE)) return null;
  try {
    const payload = JSON.parse(data);
    if (payload?.type !== MESSAGE || !Number.isSafeInteger(payload.nonce)
      || typeof payload.url !== 'string' || typeof payload.product !== 'boolean') return null;
    return { nonce: payload.nonce, url: payload.url, product: payload.product };
  } catch { return null; }
}

/** UI hint only, for server-authorized on-demand pages. No capture, network or
 * merchant data returned: only a same-document yes/no. The existing reader
 * and backend still verify the item and the user's exact selection on tap. */
export function productSurfaceProbe(nonce: number, aliExpress: boolean): string {
  return String.raw`(function () {
    if (window.__aywebsStopProductProbe) window.__aywebsStopProductProbe();
    var initial = location.href, last, timer, observer;
    function visible(node) {
      return node && node.getClientRects().length && !node.closest('[hidden], [aria-hidden="true"]')
        && getComputedStyle(node).visibility !== 'hidden';
    }
    function samePage(value) {
      if (typeof value !== 'string' || !value.trim() || value.charAt(0) === '#') return false;
      try {
        var a = new URL(value, location.href), b = new URL(location.href);
        return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') && a.search === b.search;
      } catch (_) { return false; }
    }
    function structuredProduct() {
      if (location.pathname === '/') return false;
      var title = document.querySelector('main h1, h1');
      if (!visible(title)) return false;
      function normalized(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
      var titleText = normalized(title.textContent);
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < Math.min(scripts.length, 20); i++) {
        try {
          var raw = scripts[i].textContent;
          if (!raw || raw.length > 100000) continue;
          var value = JSON.parse(raw);
          var rows = Array.isArray(value) ? value : Array.isArray(value && value['@graph']) ? value['@graph'] : [value];
          for (var j = 0; j < Math.min(rows.length, 40); j++) {
            var p = rows[j];
            if (!p || [].concat(p['@type']).indexOf('Product') < 0 || !p.offers || !titleText || titleText !== normalized(p.name)) continue;
            var entity = p.mainEntityOfPage;
            if (samePage(p.url) || samePage(typeof entity === 'string' ? entity : entity && entity['@id'])) return true;
          }
        } catch (_) {}
      }
      return false;
    }
    function aliModal() {
      var nodes = document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="sku-modal" i], [class*="sku-panel" i], [class*="sku-popup" i], [class*="sku-drawer" i], [class*="comet-v2-drawer" i], [class*="drawer-content" i], [class*="bottom-sheet" i]');
      for (var i = 0; i < Math.min(nodes.length, 20); i++) {
        var node = nodes[i];
        if (!visible(node)) continue;
        var sku = node.querySelector('[data-sku-col], [class*="sku-item" i], [class*="sku-prop" i], [role="radio"]');
        if (!visible(sku)) continue;
        var actions = node.querySelectorAll('button, [role="button"]');
        for (var j = 0; j < Math.min(actions.length, 40); j++) {
          if (visible(actions[j]) && /^(?:add to (?:cart|bag|my picks)|ajouter (?:au panier|à mes sélections)|أضف إلى السلة)$/i.test(actions[j].textContent.trim().replace(/\s+/g, ' '))) return true;
        }
      }
      return false;
    }
    function check() {
      timer = null;
      // A new URL gets its own native analysis and observer.
      var product = initial === location.href && (${aliExpress ? 'aliModal()' : 'structuredProduct()'});
      if (product === last) return;
      last = product;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${MESSAGE}', nonce: ${nonce}, url: initial, product: product }));
    }
    function schedule() { if (timer === null) timer = setTimeout(check, 120); }
    window.__aywebsStopProductProbe = function () { if (observer) observer.disconnect(); clearTimeout(timer); };
    check();
    if (document.documentElement) {
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-modal'] });
    }
  })(); true;`;
}

export const STOP_PRODUCT_SURFACE_PROBE = 'if (window.__aywebsStopProductProbe) window.__aywebsStopProductProbe(); true;';
