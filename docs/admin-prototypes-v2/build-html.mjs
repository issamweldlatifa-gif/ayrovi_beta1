/**
 * Générateur des maquettes HTML « consoles d'entreprise » (modèles B, C, D).
 *
 * Le modèle A (Amazon Seller Central) est écrit à la main : sa structure en deux bandeaux de
 * navigation ne se dérive pas utilement. Les trois autres partagent le même contenu et le même
 * squelette, et ne diffèrent que par les conventions de leur modèle de référence :
 *   B — Stripe Dashboard      : rail blanc, métriques, graphique, tiroir d'événements.
 *   C — Google Cloud Console  : barre d'application, navigation de service horizontale, inspecteur.
 *   D — Shopify Admin         : barre encre, navigation à compteurs, cartes de synthèse, barre
 *                               de sauvegarde contextuelle en bas.
 *
 * Usage : node docs/admin-prototypes-v2/build-html.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);

const orders = [
  ['AYR-TN-10241', 'Sonia Ben Ali', 'Confirmed', 'Deposit approved', '412 900', '4', '22/09 09:14', 'Standard · 29/09', 'ok'],
  ['AYR-TN-10240', 'Mehdi Trabelsi', 'To verify', 'Receipt received', '268 400', '2', '22/09 08:02', 'Awaiting', 'info'],
  ['AYR-TN-10239', 'Ines Gharbi', 'Preparing', 'Paid', '1 120 000', '6', '21/09 18:47', 'Express · 25/09', 'wait'],
  ['AYR-TN-10238', 'Walid Chaabane', 'Deposit due', 'Customer pending', '96 500', '1', '21/09 16:20', 'Reminder J+2', 'neutral'],
  ['AYR-TN-10237', 'Nesrine Khelifi', 'Delivered', 'Paid', '154 300', '3', '21/09 11:05', 'Handed over', 'ok'],
  ['AYR-TN-10236', 'Anis Bouzid', 'Delivered', 'Paid', '73 200', '2', '20/09 15:41', 'Handed over', 'ok'],
  ['AYR-TN-10235', 'Rania Dridi', 'Cancelled', 'Refunded', '38 900', '1', '20/09 12:07', '—', 'bad'],
];

const nav = [
  ['Daily operations', ['Dashboard', 'Orders 12', 'Support inbox 4', 'Customers']],
  ['Content', ['Arrivals', 'Header strip 3', 'Magazine', 'Social']],
  ['Commerce', ['Arrival CRM', 'Lens quotes', 'Pricing rules', 'Inventory', 'Purchasing']],
  ['Administration', ['Roles & permissions', 'Audit log', 'Settings']],
];

const palette = {
  B: { accent: '#635BFF', canvas: '#F6F9FC', card: '#FFFFFF', line: '#E3E8EE', text: '#0A2540', muted: '#425466', ok: '#1FB57A', warn: '#C77B21', info: '#4F5BFF', bad: '#D6403A', alt: '#F7FAFC', radius: '10px' },
  C: { accent: '#1A73E8', canvas: '#F8F9FA', card: '#FFFFFF', line: '#DADCE0', text: '#202124', muted: '#5F6368', ok: '#188038', warn: '#B06000', info: '#1A73E8', bad: '#C5221F', alt: '#F1F3F4', radius: '8px' },
  D: { accent: '#008060', canvas: '#F6F6F7', card: '#FFFFFF', line: '#E1E3E5', text: '#303030', muted: '#616161', ok: '#008060', warn: '#916A00', info: '#005BD3', bad: '#D72C0D', alt: '#F7F7F7', radius: '10px' },
};

const rowsHtml = (rows = orders) => rows.map((row, index) => `
              <tr${index === 0 ? ' class="is-selected"' : ''}>
                <td class="num mono">${row[0]}</td><td>${row[1]}</td><td><span class="pill ${row[8]}">${row[2]}</span></td>
                <td>${row[3]}</td><td class="end num">${row[4]}</td><td class="end num">${row[5]}</td><td class="num">${row[6]}</td><td>${row[7]}</td>
              </tr>`).join('');

const navHtml = () => nav.map(([group, items]) => `
        <h5>${group}</h5>
${items.map((item) => {
  const match = /^(.*?)\s+(\d+)$/.exec(item);
  const label = match ? match[1] : item;
  const count = match ? match[2] : '';
  const isActive = label === 'Orders';
  return `        <a href="#"${isActive ? ' class="is-active"' : ''}>${label}${count ? `<span class="count">${count}</span>` : ''}</a>`;
}).join('\n')}`).join('');

const stripHtml = (p) => `
        <div class="navrow"><b>Arrivage · وصلات جديدة</b><span class="state on">active</span><small>/arrivage · order 10</small></div>
        <div class="navrow"><b>Gift &amp; Cards · هدايا وبطاقات</b><span class="state on">active</span><small>/gift-cards · order 20</small></div>
        <div class="navrow"><b>Magazine · مجلة AYROVI</b><span class="state off">hidden</span><small>/magazine · order 30</small></div>`;

const baseCss = (p) => `
  @font-face{font-family:'Zalando Sans';src:url(/*AYROVI_FONT_PLACEHOLDER*/) format('woff2');font-weight:100 900;font-display:swap}
  :root{--accent:${p.accent};--canvas:${p.canvas};--card:${p.card};--line:${p.line};--text:${p.text};--muted:${p.muted};
        --ok:${p.ok};--warn:${p.warn};--info:${p.info};--bad:${p.bad};--alt:${p.alt};--radius:${p.radius}}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--canvas);color:var(--text);font-family:'Zalando Sans','Noto Sans Arabic',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .ar,[dir="rtl"]{font-family:'Zalando Sans','Noto Sans Arabic','Segoe UI',Tahoma,sans-serif}
  .num{font-variant-numeric:tabular-nums}
  .mono{font-weight:700}
  button{font:inherit;cursor:pointer}
  .btn{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:var(--radius);padding:8px 14px;font-size:12.5px;font-weight:600}
  .btn:hover{border-color:#C4C9CE}
  .btn--primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius)}
  .card>header{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .card>header h2{margin:0;font-size:14px;font-weight:800}
  .card>header small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
  .card>header .right{margin-inline-start:auto;display:flex;gap:8px}
  .tablewrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse}
  thead th{text-align:start;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:800;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--alt)}
  thead th.end,tbody td.end{text-align:end}
  tbody td{padding:0 12px;height:34px;border-bottom:1px solid #EDEFF2;white-space:nowrap;font-size:12.5px}
  tbody tr:hover{background:var(--alt)}
  tbody tr.is-selected{box-shadow:inset 2px 0 0 var(--accent);background:#F3F8FF}
  .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--alt);color:var(--muted)}
  .pill.ok{color:var(--ok)} .pill.wait{color:var(--warn)} .pill.info{color:var(--info)} .pill.bad{color:var(--bad)}
  .navrow{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:8px 0;border-bottom:1px solid #EFF1F4;font-size:12px}
  .navrow small{grid-column:1 / -1;color:var(--muted);font-size:10.5px}
  .state{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
  .state.on{color:var(--ok)} .state.off{color:var(--muted)}
  .kv{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #EFF1F4;font-size:12px}
  .kv span{color:var(--muted)} .kv b{font-weight:700}
  .sec{padding:12px 14px;border-top:1px solid var(--line)}
  .sec h4{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:800}
  .audit{font-size:11px;color:var(--muted);line-height:1.9;margin:0}
  .navlist h5{margin:14px 14px 4px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:800}
  .navlist a{display:flex;align-items:center;gap:8px;padding:7px 14px;font-size:12.5px;color:#3B4148}
  .navlist a:hover{background:var(--alt)}
  .navlist a.is-active{background:var(--alt);font-weight:700;color:var(--text);box-shadow:inset 2px 0 0 var(--accent)}
  .navlist .count{margin-inline-start:auto;font-size:11px;font-weight:700;color:var(--muted)}
  @media (max-width:700px){ .metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important} }
  @media (max-width:1150px){ .side{display:none} .layout{grid-template-columns:1fr!important} .body{grid-template-columns:minmax(0,1fr)!important; } .shell{grid-template-columns:minmax(0,1fr)!important} }
`;

const head = (title, p) => `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${baseCss(p)}</style>
</head>
<body>`;

/* ── B · Stripe Dashboard ──────────────────────────────────────────────────────────────────── */
function modeleB() {
  const p = palette.B;
  return `${head('AYROVI Console — Model B · Stripe Dashboard style', p)}
<div class="layout" style="display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh">
  <nav class="navlist side" style="background:var(--card);border-inline-end:1px solid var(--line)">
    <div style="padding:18px 16px 10px;font-weight:800;letter-spacing:.22em;font-size:14px">AYROVI</div>
    <div style="margin:0 14px 10px;background:var(--alt);border-radius:999px;padding:8px 14px;color:var(--muted);font-size:12px">Search  ⌘K</div>
${navHtml()}
    <div style="margin:16px 14px 0;background:#FFF6E5;border-radius:999px;padding:7px 12px;text-align:center;font-size:11px;font-weight:700;color:#8A6116">Test mode · production ready</div>
  </nav>

  <main style="padding:22px 24px 40px;display:grid;gap:18px;grid-template-columns:minmax(0,1fr)">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:800">Payments &amp; deposits</h1>
        <p style="margin:5px 0 0;color:var(--muted);font-size:12.5px">Last 30 days · settlement currency TND · 1 248 orders</p>
      </div>
      <div style="margin-inline-start:auto;display:flex;gap:8px"><button class="btn">Export</button><button class="btn btn--primary">Validate a deposit</button></div>
    </div>

    <section class="metrics" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px">
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Gross volume</span><b class="num" style="display:block;font-size:21px;margin-top:6px">486 320 TND</b><small style="color:var(--ok);font-weight:700">+8,4 % vs previous period</small></article>
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Collected</span><b class="num" style="display:block;font-size:21px;margin-top:6px">312 480 TND</b><small style="color:var(--ok);font-weight:700">+5,1 %</small></article>
      <article class="card" style="padding:14px 16px;border-color:var(--accent)"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Deposits to verify</span><b class="num" style="display:block;font-size:21px;margin-top:6px">7</b><small style="color:var(--warn);font-weight:700">2 customers waiting</small></article>
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Disputes</span><b class="num" style="display:block;font-size:21px;margin-top:6px">3</b><small style="color:var(--muted);font-weight:700">−1 this week</small></article>
    </section>

    <section class="card" style="padding:14px 16px">
      <header style="display:flex;align-items:center;border:0;padding:0 0 10px"><h2 style="margin:0;font-size:13.5px">Daily collections</h2><span style="margin-inline-start:auto;color:var(--muted);font-size:11.5px">EUR · USD · GBP settled to TND</span></header>
      <svg viewBox="0 0 1100 120" width="100%" height="120" role="img" aria-label="Daily collections trend">
        ${[0, 1, 2, 3].map((i) => `<line x1="0" y1="${20 + i * 26}" x2="1100" y2="${20 + i * 26}" stroke="#EEF2F7" />`).join('')}
        <polyline points="20,96 110,80 200,86 290,64 380,70 470,42 560,50 650,28 740,36 830,18 920,26 1010,10 1080,16" fill="none" stroke="${p.accent}" stroke-width="2.5" />
        <polygon points="20,110 20,96 110,80 200,86 290,64 380,70 470,42 560,50 650,28 740,36 830,18 920,26 1010,10 1080,16 1080,110" fill="${p.accent}" opacity="0.08" />
      </svg>
    </section>

    <div style="display:flex;gap:20px;border-bottom:1px solid var(--line);overflow-x:auto">
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Overview</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Payments</a>
      <a href="#" style="padding:10px 2px;border-bottom:2px solid var(--accent);font-size:12.5px;font-weight:700">Deposits</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Customers</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Invoices</a>
    </div>

    <div class="body" style="display:grid;grid-template-columns:minmax(0,1fr) 288px;gap:16px;align-items:start">
      <section class="card">
        <header><div><h2>Orders awaiting a decision</h2><small>7 deposits · receipts attached</small></div><div class="right"><button class="btn">Filter</button></div></header>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th class="end">Total TND</th><th class="end">Items</th><th>Created</th><th>Shipment</th></tr></thead>
          <tbody>${rowsHtml()}</tbody>
        </table>
      </section>

      <aside class="card">
        <header><div><h2 class="num">AYR-TN-10241</h2><small>Sonia Ben Ali · Confirmed</small></div></header>
        <div style="padding:12px 14px">
          <div class="kv"><span>Amount</span><b class="num">412 900 TND</b></div>
          <div class="kv"><span>Deposit received</span><b class="num">82 580 TND</b></div>
          <div class="kv"><span>Method</span><b>Bank transfer</b></div>
          <div class="kv"><span>Governorate</span><b>Ariana</b></div>
        </div>
        <div class="sec">
          <h4>Event timeline</h4>
          <p class="audit">
            09:15 · Deposit approved by Issam<br />
            09:14 · Order created (Lens import)<br />
            08:02 · Receipt uploaded by customer<br />
            21/09 16:20 · Payment link sent
          </p>
        </div>
        <div class="sec">
          <h4>Header strip (site content)</h4>
${stripHtml(p)}
        </div>
        <div class="sec" style="display:flex;gap:8px"><button class="btn btn--primary">Validate</button><button class="btn">Refund</button></div>
      </aside>
    </div>
  </main>
</div>
</body>
</html>
`;
}

/* ── C · Google Cloud / AWS console ───────────────────────────────────────────────────────── */
function modeleC() {
  const p = palette.C;
  return `${head('AYROVI Console — Model C · Cloud console style', p)}
<header style="background:var(--card);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:10px 18px;flex-wrap:wrap">
  <span style="font-weight:800;letter-spacing:.06em">AYROVI Cloud Console</span>
  <span style="background:var(--alt);border-radius:4px;padding:6px 12px;font-size:12px;font-weight:700">Project: ayrovi-production</span>
  <div style="margin-inline-start:auto;display:flex;align-items:center;gap:8px;background:var(--alt);border-radius:4px;padding:7px 14px;width:min(440px,36vw);min-width:0;white-space:nowrap;overflow:hidden;color:var(--muted);font-size:12px">Search resources, screens, permissions… <b style="margin-inline-start:auto;color:var(--text)">⌘K</b></div>
  <span style="color:var(--muted);font-size:12px">Help · Activity · SA</span>
</header>
<nav style="background:var(--card);border-bottom:1px solid var(--line);display:flex;gap:0;padding:0 10px;overflow-x:auto" aria-label="Service navigation">
  ${['Dashboard', 'Orders', 'Arrivals', 'Catalogue', 'Inventory', 'Pricing', 'Reports', 'IAM'].map((tab) => tab === 'Orders'
    ? `<a href="#" style="padding:13px 18px;font-size:12.5px;font-weight:700;border-bottom:3px solid var(--accent)">${tab}</a>`
    : `<a href="#" style="padding:13px 18px;font-size:12.5px;color:var(--muted)">${tab}</a>`).join('')}
</nav>

<main style="padding:18px 22px 40px;display:grid;gap:14px;grid-template-columns:minmax(0,1fr)">
  <div>
    <p style="margin:0;color:var(--muted);font-size:11.5px">Commerce › Orders › ayr-tn-10241</p>
    <div style="display:flex;align-items:flex-end;gap:14px;margin-top:6px">
      <h1 style="margin:0;font-size:24px;font-weight:700">Orders</h1>
      <span style="color:var(--muted);font-size:12px;padding-bottom:4px">1 248 resources · 12 awaiting action · filter: payment = to verify</span>
      <div style="margin-inline-start:auto;display:flex;gap:8px"><button class="btn">Refresh</button><button class="btn btn--primary">Create order</button></div>
    </div>
  </div>

  <section class="card" style="padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <strong style="font-size:11.5px;color:var(--muted)">Filter:</strong>
    <span class="pill info">status: to verify ✕</span>
    <span class="pill info">payment: receipt received ✕</span>
    <span class="pill info">governorate: Ariana ✕</span>
    <span class="pill">+ Add condition</span>
    <span style="margin-inline-start:auto;color:var(--muted);font-size:11.5px">Density: compact · Columns · Saved views</span>
  </section>

  <div class="body" style="display:grid;grid-template-columns:minmax(0,1fr) 470px;gap:16px;align-items:start">
    <section class="card">
      <header style="background:var(--alt)"><input type="checkbox" aria-label="Select all" /><strong>3 selected</strong><div class="right"><button class="btn">Actions ▾</button><button class="btn">Export</button><button class="btn">Label</button></div></header>
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th class="end">Total TND</th><th class="end">Items</th><th>Created</th><th>Shipment</th></tr></thead>
        <tbody>${rowsHtml()}</tbody>
      </table>
      <div style="padding:10px 14px;color:var(--muted);font-size:11.5px;border-top:1px solid var(--line)" class="num">1–7 of 1 248 · 50 per page</div>
    </section>

    <aside class="card">
      <header style="gap:18px">
        <h2 style="font-size:15px" class="num">ayr-tn-10241</h2>
        <span style="display:flex;gap:16px;margin-inline-start:auto;font-size:12px">
          <a href="#" style="color:var(--muted)">Details</a><a href="#" style="color:var(--muted)">Audit</a><a href="#" style="color:var(--muted)">Links</a>
          <a href="#" style="font-weight:700;border-bottom:2px solid var(--accent);padding-bottom:2px">Header strip</a>
        </span>
      </header>
      <div style="padding:8px 14px 12px">
        <div class="kv"><span>Customer</span><b>Sonia Ben Ali · +216 21 ••• 447</b></div>
        <div class="kv"><span>Status</span><b>Confirmed</b></div>
        <div class="kv"><span>Total</span><b class="num">412 900 TND</b></div>
        <div class="kv"><span>Deposit</span><b class="num">82 580 TND (20 %)</b></div>
        <div class="kv"><span>Pricing snapshot</span><b>v3 · EUR 1 → 3,412 TND</b></div>
      </div>
      <div class="sec">
        <h4>Header strip — linked resources</h4>
        <div class="navrow"><b>arrivage → /arrivage</b><span class="state on">active</span><small>label FR « Arrivage » · label AR « وصلات جديدة » · order 10</small></div>
        <div class="navrow"><b>gift-cards → /gift-cards</b><span class="state on">active</span><small>label FR « Gift &amp; Cards » · label AR « هدايا وبطاقات » · order 20</small></div>
        <div class="navrow"><b>magazine → /magazine</b><span class="state off">hidden</span><small>label FR « Magazine » · label AR « مجلة AYROVI » · order 30</small></div>
      </div>
      <div class="sec">
        <h4>Audit log (excerpt)</h4>
        <p class="audit">
          22/09 09:15 · APPROVE deposit (Issam, EMP-0001)<br />
          22/09 09:14 · CREATE order — Lens import<br />
          21/09 18:47 · UPDATE status CONFIRMED
        </p>
      </div>
      <div class="sec" style="background:var(--alt);display:flex;gap:14px;font-size:12px;font-weight:600;color:var(--accent)">
        <a href="#">Validate deposit</a><a href="#">Mark ready</a><a href="#">Issue invoice</a><a href="#">Archive</a>
      </div>
    </aside>
  </div>
</main>
</body>
</html>
`;
}

/* ── D · Shopify Admin ────────────────────────────────────────────────────────────────────── */
function modeleD() {
  const p = palette.D;
  return `${head('AYROVI Console — Model D · Shopify Admin style', p)}
<header style="background:#1A1A1A;color:#fff;display:flex;align-items:center;gap:16px;padding:10px 18px">
  <span style="font-weight:800;letter-spacing:.2em">AYROVI</span>
  <div style="display:flex;align-items:center;gap:8px;background:#303030;border-radius:10px;padding:7px 14px;width:min(460px,40vw);color:#B5B5B5;font-size:12px">Search  ⌘K</div>
  <span style="margin-inline-start:auto;color:#D4D4D4;font-size:12px">Store AYROVI · TN · Issam</span>
</header>
<div class="layout" style="display:grid;grid-template-columns:224px minmax(0,1fr);align-items:start">
  <nav class="navlist side" style="background:var(--alt);min-height:calc(100vh - 44px)">
${navHtml()}
  </nav>
  <main style="padding:20px 24px 40px;display:grid;gap:16px;grid-template-columns:minmax(0,1fr)">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <div><h1 style="margin:0;font-size:22px;font-weight:700">Orders</h1><p style="margin:4px 0 0;color:var(--muted);font-size:12.5px">12 orders need attention · 3 arrivals in review</p></div>
      <div style="margin-inline-start:auto;display:flex;gap:8px"><button class="btn">Export</button><button class="btn btn--primary">Create order</button></div>
    </div>

    <div style="display:flex;gap:20px;border-bottom:1px solid var(--line);overflow-x:auto">
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">All</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Open</a>
      <a href="#" style="padding:10px 2px;border-bottom:2px solid var(--text);font-size:12.5px;font-weight:700">To verify</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Deposit due</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Shipped</a>
      <a href="#" style="padding:10px 2px;font-size:12.5px;color:var(--muted)">Archived</a>
    </div>

    <section class="metrics" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px">
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Orders today</span><b class="num" style="display:block;font-size:20px;margin-top:6px">18</b><small style="color:var(--ok);font-weight:700">+4 vs yesterday</small></article>
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Revenue</span><b class="num" style="display:block;font-size:20px;margin-top:6px">42 380 TND</b><small style="color:var(--ok);font-weight:700">+6,2 %</small></article>
      <article class="card" style="padding:14px 16px;border-color:var(--accent)"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Deposits to verify</span><b class="num" style="display:block;font-size:20px;margin-top:6px">7</b><small style="color:var(--warn);font-weight:700">needs a decision</small></article>
      <article class="card" style="padding:14px 16px"><span style="color:var(--muted);font-size:11.5px;font-weight:600">Arrivals to validate</span><b class="num" style="display:block;font-size:20px;margin-top:6px">3</b><small style="color:var(--muted);font-weight:700">2 ambiguous</small></article>
    </section>

    <section class="card">
      <header style="background:var(--alt)"><input type="checkbox" aria-label="Select all" /><strong>3 selected</strong><div class="right"><button class="btn">Edit</button><button class="btn">Archive</button><button class="btn">Export</button><button class="btn">Tag</button></div></header>
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th class="end">Total TND</th><th class="end">Items</th><th>Created</th><th>Shipment</th></tr></thead>
        <tbody>${rowsHtml()}</tbody>
      </table>
      <div style="padding:10px 14px;color:var(--muted);font-size:11.5px;border-top:1px solid var(--line)" class="num">1–7 of 1 248 · 50 per page</div>
    </section>

    <section class="card" style="padding:14px 16px">
      <header style="padding:0 0 10px;border:0"><div><h2>Header strip</h2><small>Site content · publishes immediately on save</small></div><div class="right"><button class="btn">Preview</button><button class="btn btn--primary">Save</button></div></header>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
        <div style="border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px">
          <b style="font-size:12px">Arrivage · وصلات جديدة</b>
          <div style="color:var(--muted);font-size:11px;margin-top:4px">/arrivage · order 10</div>
          <span class="state on">active</span>
        </div>
        <div style="border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px">
          <b style="font-size:12px">Gift &amp; Cards · هدايا وبطاقات</b>
          <div style="color:var(--muted);font-size:11px;margin-top:4px">/gift-cards · order 20</div>
          <span class="state on">active</span>
        </div>
        <div style="border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px">
          <b style="font-size:12px">Magazine · مجلة AYROVI</b>
          <div style="color:var(--muted);font-size:11px;margin-top:4px">/magazine · order 30</div>
          <span class="state off">hidden</span>
        </div>
      </div>
      <div style="margin-top:14px;background:#303030;color:#fff;border-radius:var(--radius);padding:10px 14px;display:flex;align-items:center;font-size:12px">
        Unsaved changes to the public header strip
        <span style="margin-inline-start:auto;display:flex;gap:16px;font-weight:700"><a href="#">Discard</a><a href="#">Save</a></span>
      </div>
    </section>
  </main>
</div>
</body>
</html>
`;
}

const outputs = [
  ['b-stripe-console.html', modeleB()],
  ['c-cloud-console.html', modeleC()],
  ['d-shopify-console.html', modeleD()],
];
for (const [name, html] of outputs) {
  // Chaque tableau est placé dans un conteneur défilant : sur mobile la page ne s'élargit plus.
  const wrapped = html.replace(/<table>[\s\S]*?<\/table>/g, (table) => `<div class="tablewrap">${table}</div>`);
  fs.writeFileSync(path.join(here, name), wrapped);
  console.log(name, `${Math.round(wrapped.length / 1024)} Ko`);
}
