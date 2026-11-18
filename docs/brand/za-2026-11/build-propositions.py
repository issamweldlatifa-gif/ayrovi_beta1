#!/usr/bin/env python3
"""Construit la planche de propositions du logo « Za. » (2026-11-18).

Entrées (même dossier) :
  - za-geometry.json      : géométrie vectorielle reconstruite (cercle r=500 en 500,500,
                            Z polygonal, « a » tracé, point) depuis
                            za_logo_yellow_dot_spaced.png (2048 px), ovale de 1,7 % corrigé.
  - wordmark-glyphs.json  : « yrovi » / « zayrovi » en Zayrovi Extracted Sans Bold (OFL),
                            en unités de fonte (y vers le bas, ligne de base à 0).
  - reference-*.jpg       : les images fournies, pour comparaison.
Sortie : ZAYROVI-Za-propositions.html (autonome, aucune ressource externe).

    python3 docs/brand/za-2026-11/build-propositions.py
"""
import base64
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
G = json.loads((HERE / "za-geometry.json").read_text())
W = json.loads((HERE / "wordmark-glyphs.json").read_text())

YELLOW = "#FBB809"
INK = "#000000"
BLUE = "#0A63F5"
Z, A, DOT = G["z"], G["a"], G["dot"]
A_RIGHT = 1433.4  # bord droit du « a » (unités logo)
DOT_RIGHT = DOT["cx"] + DOT["r"]


def b64(name):
    return base64.b64encode((HERE / name).read_bytes()).decode()


# ---------------------------------------------------------------- symboles SVG
def za(dx=0, circle=YELLOW, z=INK, a="#FFFFFF", dot=YELLOW, knock=False, with_dot=True):
    """Le logo « Za. » ; dx décale le « a » et le point (espacement)."""
    out = [f'<circle cx="500" cy="500" r="500" fill="{circle}" mask="url(#mZ)"/>']
    if not knock:
        out.append(f'<use href="#pZ" fill="{z}" clip-path="url(#clipC)"/>')
    out.append(f'<use href="#pA" fill="{a}" transform="translate({dx} 0)"/>')
    if with_dot:
        out.append(f'<circle cx="{DOT["cx"] + dx}" cy="{DOT["cy"]}" r="{DOT["r"]}" fill="{dot}"/>')
    return "".join(out)


def sym(id_, body, w, h=1000, x=0, y=0):
    return f'<symbol id="{id_}" viewBox="{x} {y} {w} {h}">{body}</symbol>'


XH = W["xh"]
# Logotype complet « zayrovi. » : « Za » du logo + « yrovi » en Zayrovi Sans + le point à la fin.
S_FULL = 395 / XH
YR_X = A_RIGHT + 18
YR_END = YR_X + W["yrovi_adv"] * S_FULL
FULL_DOT_CX = YR_END + 28 + DOT["r"]
FULL_W = FULL_DOT_CX + DOT["r"] + 10


def full(a="#FFFFFF", word="#FFFFFF", dot=YELLOW):
    return (za(a=a, with_dot=False)
            + f'<path d="{W["yrovi"]}" fill="{word}" transform="translate({YR_X:.1f} 716) scale({S_FULL:.4f})"/>'
            + f'<circle cx="{FULL_DOT_CX:.1f}" cy="{DOT["cy"]}" r="{DOT["r"]}" fill="{dot}"/>')


# Signature « Za. | zayrovi » : logo intact + nom en petit.
S_LOCK = 230 / XH
LOCK_RULE_X = DOT_RIGHT + 90
LOCK_TXT_X = LOCK_RULE_X + 100
LOCK_W = LOCK_TXT_X + W["zayrovi_adv"] * S_LOCK + 10


def lockup(a="#FFFFFF", word="#FFFFFF", rule="rgba(255,255,255,.35)"):
    return (za(a=a)
            + f'<rect x="{LOCK_RULE_X:.0f}" y="300" width="14" height="400" fill="{rule}"/>'
            + f'<path d="{W["zayrovi"]}" fill="{word}" transform="translate({LOCK_TXT_X:.0f} 615) scale({S_LOCK:.4f})"/>')


LOGO_W = DOT_RIGHT + 6
SYMBOLS = "".join([
    sym("za-dark", za(), LOGO_W),
    sym("za-dark-A0", za(dx=-80), LOGO_W - 80),
    sym("za-dark-A2", za(dx=70), LOGO_W + 70),
    sym("za-light", za(a=INK), LOGO_W),
    sym("za-light-ink", za(a=INK, dot=INK), LOGO_W),
    sym("za-light-A0", za(dx=-80, a=INK), LOGO_W - 80),
    sym("za-mono-white", za(circle="#FFFFFF", a="#FFFFFF", dot="#FFFFFF", knock=True), LOGO_W),
    sym("za-mono-black", za(circle=INK, a=INK, dot=INK, knock=True), LOGO_W),
    sym("mark", za(with_dot=False, a="none"), 1000),
    sym("mark-mono-white", za(circle="#FFFFFF", knock=True, with_dot=False, a="none"), 1000),
    sym("mark-mono-black", za(circle=INK, knock=True, with_dot=False, a="none"), 1000),
    sym("full-dark", full(), FULL_W),
    sym("full-light", full(a=INK, word=INK), FULL_W),
    sym("lock-dark", lockup(), LOCK_W),
    sym("lock-light", lockup(a=INK, word=INK, rule="rgba(0,0,0,.25)"), LOCK_W),
])
S_TILE = 700 / LOGO_W
TILE = (f'<symbol id="za-tile" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="220" fill="{INK}"/>'
        f'<g transform="translate({(1000 - 700) / 2:.1f} {(1000 - 1000 * S_TILE) / 2:.1f}) scale({S_TILE:.4f})">{za()}</g></symbol>')

SPRITE = f'''<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
<defs>
<path id="pZ" d="{Z}"/><path id="pA" d="{A}"/>
<clipPath id="clipC"><circle cx="500" cy="500" r="500"/></clipPath>
<mask id="mZ" maskUnits="userSpaceOnUse" x="-10" y="-10" width="1020" height="1020">
<circle cx="500" cy="500" r="500" fill="#fff"/><use href="#pZ" fill="#000"/></mask>
</defs>{SYMBOLS}{TILE}</svg>'''


def use(id_, h, extra="", label="ZAYROVI"):
    ratios = {"za-dark": LOGO_W, "za-dark-A0": LOGO_W - 80, "za-dark-A2": LOGO_W + 70, "za-light": LOGO_W,
              "za-light-ink": LOGO_W, "za-light-A0": LOGO_W - 80, "za-mono-white": LOGO_W, "za-mono-black": LOGO_W,
              "mark": 1000, "mark-mono-white": 1000, "mark-mono-black": 1000, "za-tile": 1000,
              "full-dark": FULL_W, "full-light": FULL_W, "lock-dark": LOCK_W, "lock-light": LOCK_W}
    w = h * ratios[id_] / 1000
    return (f'<svg class="logo" width="{w:.1f}" height="{h}" role="img" aria-label="{label}" {extra}>'
            f'<use href="#{id_}"/></svg>')


# ------------------------------------------------------------------ gabarits UI
def product_card(btn_bg, btn_fg, badge_bg, badge_fg, btn_label="Ajouter au panier"):
    return f'''<div class="pcard">
  <div class="pimg"><span class="pbadge" style="background:{badge_bg};color:{badge_fg}">-30%</span>
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#B9B9B9" stroke-width="1.4"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg></div>
  <div class="pname">Produit d'exemple</div>
  <div class="pprice"><b>XX,XXX DT</b> <s>XX,XXX DT</s></div>
  <button class="pbtn" style="background:{btn_bg};color:{btn_fg}">{btn_label}</button>
</div>'''


def phone(header_bg, logo_html, body, header_border=True, aywebs=None):
    border = "border-bottom:1px solid #EDEDED;" if header_border else ""
    ay = ""
    if aywebs:
        bg, logo2, fg = aywebs
        ay = (f'<div class="ayweb" style="background:{bg};color:{fg}">{logo2}<span class="aylabel">AYWEBs</span>'
              f'<span class="aysearch">Rechercher sur Amazon, Shein…</span></div>')
    return f'''<div class="phone" dir="ltr"><div class="status"><span>9:41</span><span>●●● ▮</span></div>
<div class="hdr" style="background:{header_bg};{border}">{logo_html}<span class="hicons">⌕ &nbsp;♡</span></div>
<div class="pbody">{body}</div>{ay}</div>'''


def option(group, code, title, body, note="", recommended=False, checked=False):
    rec = '<span class="rec">اقتراحي ★</span>' if recommended else ""
    return f'''<label class="opt{' is-rec' if recommended else ''}">
  <input type="radio" name="{group}" value="{code}" {'checked' if checked else ''}>
  <div class="opt-head"><span class="code">{code}</span><span class="otitle">{title}</span>{rec}</div>
  <div class="opt-body">{body}</div>
  {f'<p class="note">{note}</p>' if note else ''}
</label>'''


def section(num, title, intro, options, cols=3):
    return f'''<section class="q" id="q{num}"><h2><span class="qn">{num}</span>{title}</h2>
<p class="intro">{intro}</p><div class="opts cols{cols}">{''.join(options)}</div></section>'''


# --------------------------------------------------------------------- contenu
light_header = use("za-light", 30)
sections = []

# 1 — Espacement
def spacing_card(sym_dark, sym_light):
    return (f'<div class="duo"><div class="pane dark">{use(sym_dark, 92)}</div>'
            f'<div class="pane light">{use(sym_light, 92)}</div></div>')

sections.append(section(1, "المسافة بين الدائرة والـ a",
    "حطّيت الثلاثة جنب بعضهم، كل واحد على الأسود وعلى الأبيض. A1 هو نفس المسافة اللي اخترتها في الصورة الأخيرة.",
    [
        option("A", "A0", "ملتصق (كيما الـ splash الأوّل)", spacing_card("za-dark-A0", "za-light-A0"),
               "على الأبيض الـ a الأسود يتلصق في ساق الـ z وتولّي كتلة وحدة."),
        option("A", "A1", "مبعّد شويّة (اختيارك)", spacing_card("za-dark", "za-light"),
               "المسافة بين الدائرة والـ a ≈ نفس المسافة بين الـ a والنقطة، فيجي إيقاع منتظم. والحروف يتقراو واضحين على الأبيض.",
               recommended=True, checked=True),
        option("A", "A2", "مبعّد أكثر", spacing_card("za-dark-A2", "za-light"),
               "أوضح، أما الـ a يولّي يبان منفصل على الرمز، والشعار يعرض أكثر في الهيدر."),
    ]))

# 2 — Fond clair
def light_card(sym_id):
    return (f'<div class="stack"><div class="pane light big">{use(sym_id, 110)}</div>'
            f'<div class="pane grey">{use(sym_id, 44)}<span class="sz">44 px</span>{use(sym_id, 26)}<span class="sz">26 px</span></div></div>')

sections.append(section(2, "الشعار على الخلفيات البيضاء",
    "موقعنا أغلبو أبيض #FFFFFF، والـ a الأبيض يختفي فوقو. وبفضل المسافة الجديدة، الـ a الأسود ما عادش يتلصق في الـ z.",
    [
        option("L", "L1", "a أسود + نقطة صفراء", light_card("za-light"),
               "يحافظ على الألوان الثلاثة. النقطة الصفراء على الأبيض باهتة شويّة (1,75:1)، أما هي تفصيلة برك.",
               recommended=True, checked=True),
        option("L", "L2", "a أسود + نقطة سوداء", light_card("za-light-ink"),
               "أوضح على الأبيض، أما الأصفر يقعد في الدائرة برك."),
        option("L", "L3", "دايمًا داخل مربّع أسود", light_card("za-tile"),
               "كيما الصورة اللي بعثتها: الشعار ما يتبدّل حتى لون، أما ياخو بلاصة أكبر في الهيدر."),
    ]))

# 3 — Rôle du jaune
c1 = phone("#FFFFFF", light_header, product_card(BLUE, "#FFFFFF", "#CF1322", "#FFFFFF"),
           aywebs=(BLUE, use("za-dark", 22), "#FFFFFF"))
c2 = phone("#FFFFFF", light_header, product_card(INK, "#FFFFFF", YELLOW, INK),
           aywebs=(INK, use("za-dark", 22), "#FFFFFF"))
c3 = phone("#FFFFFF", light_header, product_card(YELLOW, INK, INK, YELLOW),
           aywebs=(YELLOW, use("za-mono-black", 22), INK))
sections.append(section(3, "بلاصة الأصفر في ألوان التطبيق",
    "هذا أكبر قرار. انظر لبوطون «Ajouter au panier»، لعلامة التخفيض، ولشريط AYWEBs في الأسفل.",
    [
        option("C", "C1", "الأصفر للشعار برك، الأزرق يبقى للبوطونات", c1,
               "ما نبدّلو شي في التطبيق. أما أزرق مع أصفر = ألوان Walmart بالضبط، خاصة في هيدر AYWEBs."),
        option("C", "C2", "أسود + أصفر (من ألوان الشعار)", c2,
               "البوطونات سوداء، والأصفر للعروض والتخفيضات، والأزرق يقعد للروابط برك. الهويّة متناسقة مع الشعار وتجي premium.",
               recommended=True, checked=True),
        option("C", "C3", "الأصفر للبوطونات الرئيسية", c3,
               "يلفت الانتباه برشا (أسلوب Amazon)، أما الأصفر على الأبيض حدودو ضعيفة، ويلزم نص أسود ديما."),
    ]))

# 4 — En-tête
def header_card(dark_id, light_id, h_app):
    return (f'<div class="stack"><div class="site" dir="ltr">{use(light_id, 34)}<nav>Femme · Homme · Maison · AYWEBs</nav><span class="sbtn">Panier</span></div>'
            f'<div class="apphdr" dir="ltr">{use(light_id, h_app)}<span class="hicons">⌕ &nbsp;♡</span></div>'
            f'<div class="apphdr dark" dir="ltr">{use(dark_id, h_app)}<span class="hicons">⌕ &nbsp;♡</span></div></div>')

sections.append(section(4, "الهيدر: الشعار وحدو ولّا مع الاسم؟",
    "كل خيار في هيدر الموقع، وهيدر التطبيق الأبيض، والهيدر الأسود.",
    [
        option("H", "H1", "Za. وحدو", header_card("za-dark", "za-light", 30),
               "نظيف وقصير. أما الكليان الجديد ما يعرفش إنّو «Zayrovi» حتى يتعوّد."),
        option("H", "H2", "Za. | zayrovi", header_card("lock-dark", "lock-light", 26),
               "الشعار ما يتبدّل، والاسم مكتوب بجنبو. ينصح بيه في الأشهر الأولى، ومن بعد نرجعو لـ H1.",
               recommended=True, checked=True),
        option("H", "H3", "zayrovi. (الشعار يكمّل الاسم)", header_card("full-dark", "full-light", 26),
               "اقتراح إبداعي: الـ «Za» متاع الشعار تولّي بداية الكلمة، والنقطة تمشي للآخر. أما يبدّل في شكل الشعار شويّة."),
    ]))

# 5 — Taille accueil
def home_card(h, header_h):
    return phone("#FFFFFF", use("za-light", h), '<div class="hero">Hero</div><div class="row3"><i></i><i></i><i></i></div>',
                 ).replace('class="hdr"', f'class="hdr" data-h="{header_h}" style="height:{header_h}px"', 1)

sections.append(section(5, "حجم الشعار في الصفحة الرئيسية",
    "طلبت يبان أكبر شويّة. اللوغو القديم كان طولو 25 px في هيدر طولو 48 px.",
    [
        option("S", "S0", "25 px (نفس الحجم القديم)", home_card(25, 48)),
        option("S", "S1", "32 px (+28%)", home_card(32, 48),
               "يبان أكبر بوضوح، والهيدر يقعد 48 px.", recommended=True, checked=True),
        option("S", "S2", "40 px (+60%)", home_card(40, 56),
               "حضور قوي، أما يلزم نطوّلو الهيدر لـ 56 px، فتنقص بلاصة المحتوى."),
    ]))

# 6 — Icône
def icon_tile(inner_id, bg, scale, rounded=True):
    r = "22%" if rounded else "50%"
    return (f'<span class="ic" style="background:{bg};border-radius:{r}">'
            f'<svg viewBox="0 0 1000 1000" width="100%" height="100%"><g transform="translate({500 - 500 * scale} {500 - 500 * scale}) scale({scale})">'
            f'<use href="#{inner_id}"/></g></svg></span>')

def icon_full_tile(bg, rounded=True):
    r = "22%" if rounded else "50%"
    s = 0.62 * 1000 / LOGO_W
    return (f'<span class="ic" style="background:{bg};border-radius:{r}"><svg viewBox="0 0 1000 1000" width="100%" height="100%">'
            f'<g transform="translate({(1000 - LOGO_W * s) / 2:.1f} {(1000 - 1000 * s) / 2:.1f}) scale({s:.4f})">{za()}</g></svg></span>')

def homescreen(icon_html_fn):
    others = ''.join(f'<div class="app"><span class="ic ghost"></span><span>App</span></div>' for _ in range(2))
    return (f'<div class="home" dir="ltr"><div class="app">{icon_html_fn(True)}<span>ZAYROVI</span></div>{others}'
            f'<div class="app">{icon_html_fn(False)}<span>دائري</span></div></div>')

def mark_svg(id_):
    return f'<svg viewBox="0 0 1000 1000" width="100%" height="100%"><use href="#{id_}"/></svg>'

sections.append(section(6, "أيقونة التطبيق (Android)",
    "على شاشة التلفون الأيقونة صغيرة (حوالي 48–56 px)، وAndroid ينجّم يقصّها مربّع ولّا دائرة.",
    [
        option("I", "I1", "أسود + Za. كامل", homescreen(lambda r: icon_full_tile(INK, r)),
               "نفس شاشة البداية بالضبط، أما الـ a والنقطة يصغرو برشا."),
        option("I", "I2", "أسود + دائرة الـ z", homescreen(lambda r: icon_tile("mark", INK, 0.72, r)),
               "الرمز يكبر ويتعرف من بعيد، والـ a يقعد في الشعار الكامل.", recommended=True, checked=True),
        option("I", "I3", "أصفر كامل + z أسود", homescreen(
            lambda r: f'<span class="ic" style="background:{YELLOW};border-radius:{"22%" if r else "50%"}">'
                      f'<svg viewBox="0 0 1000 1000" width="100%" height="100%"><g transform="translate(150 150) scale(.7)"><use href="#pZ" fill="#000" clip-path="url(#clipC)"/></g></svg></span>'),
               "يبان برشا بين الأيقونات، أما يشبه أيقونات تطبيقات أخرى صفراء (Snapchat، Bolt…)."),
    ]))

# 7 — Favicon
def fav_card(fn):
    sizes = ''.join(f'<span class="fv" style="width:{s}px;height:{s}px">{fn()}</span><span class="sz">{s}</span>' for s in (16, 32, 48))
    return (f'<div class="stack"><div class="pane light">{sizes}</div>'
            f'<div class="tab" dir="ltr"><span class="fv" style="width:16px;height:16px">{fn()}</span>ZAYROVI — Mode, maison…<span class="x">×</span></div></div>')

sections.append(section(7, "أيقونة المتصفح (favicon)",
    "في الـ 16 px النقطة والـ a ما يبانوش. انظر للحجم الحقيقي في التبويبة.",
    [
        option("F", "F1", "Za. كامل", fav_card(lambda: f'<svg viewBox="0 0 {LOGO_W:.0f} 1000" width="100%" height="100%"><use href="#za-light"/></svg>'),
               "يتقرا بالصعوبة تحت 32 px."),
        option("F", "F2", "دائرة الـ z برك", fav_card(lambda: mark_svg("mark")),
               "واضحة حتى في 16 px، وهذا اللي تعملو العلامات الكبار.", recommended=True, checked=True),
    ], cols=2))

# Aperçus (pas de choix)
previews = f'''<section class="q" id="apercus"><h2><span class="qn">✓</span>معاينات (ما فيهمش اختيار)</h2>
<p class="intro">كيفاش يجي الشعار في البلايص الأخرى، بالاختيارات المقترحة (★).</p>
<div class="prev">
  <figure><div class="splash" dir="ltr">{use("za-dark", 70)}</div><figcaption>شاشة البداية: أسود + Za.</figcaption></figure>
  <figure><div class="mail" dir="ltr"><div class="mailtop">{use("za-dark", 30)}</div><div class="mailbody"><b>Merci pour votre commande</b><br><span>Commande n° ZY-000000</span><i></i><i></i></div></div><figcaption>إيميل: شريط أسود</figcaption></figure>
  <figure><div class="invoice" dir="ltr"><div class="invtop">{use("za-mono-black", 28)}<span>FACTURE</span></div><i></i><i></i><i></i><i class="short"></i></div><figcaption>فاتورة تتطبع بالأبيض والأسود: نسخة سوداء</figcaption></figure>
  <figure><div class="footer" dir="ltr">{use("lock-dark", 26)}<span>© 2026 ZAYROVI · zayrovi.com</span></div><figcaption>footer الموقع</figcaption></figure>
  <figure><div class="onblue" dir="ltr">{use("za-mono-white", 34)}<span>على خلفية ملوّنة: نسخة بيضاء</span></div><figcaption>نسخة بيضاء للخلفيات الملوّنة</figcaption></figure>
  <figure><div class="onphoto" dir="ltr">{use("za-dark", 34)}</div><figcaption>فوق صورة/فيديو (Reels، Stories)</figcaption></figure>
</div></section>'''

ref = f'''<section class="q" id="vector"><h2><span class="qn">0</span>من الصورة لملف vector</h2>
<p class="intro">عاودت رسمت الشعار من الصورة الأخيرة اللي بعثتها (2048 px) كملف vector نظيف: دائرة كاملة، z بخطوط مستقيمة وزوايا 45°، a ونقطة. الملف يكبر لأي حجم بلا ما يتكسّر.</p>
<div class="refgrid">
  <figure><img src="data:image/jpeg;base64,{b64("reference-za-spaced.jpg")}" alt="الصورة المرسولة" width="300" height="300"><figcaption>الصورة اللي بعثتها (raster)</figcaption></figure>
  <figure><div class="tilebox">{use("za-tile", 300)}</div><figcaption>النسخة vector متاعنا</figcaption></figure>
  <ul class="facts">
    <li><b>الأصفر:</b> <span class="sw" style="background:{YELLOW}"></span> <code>{YELLOW}</code>، مقاس من الصورة.</li>
    <li><b>الأسود:</b> <code>#000000</code>. في الصورة الأسود فيه «حبحبة» خفيفة (noise)، ونحّيناها.</li>
    <li><b>الدائرة:</b> في الصورة كانت أعرض بـ 1,7% (بيضاوية شويّة)، رجّعناها دائرة كاملة.</li>
    <li><b>الـ z:</b> خطوطو مستقيمة بزوايا 45°، والساق اللوطانية تتقصّ مع حافة الدائرة كيما في الأصل.</li>
    <li><b>الـ a:</b> مرسوم بدقّة من حوافّو. كان عندك الملف الأصلي (SVG/AI)، يبقى هو المرجع النهائي.</li>
  </ul>
</div></section>'''

CSS = """
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:"Segoe UI",Tahoma,"Noto Sans Arabic",system-ui,sans-serif;background:#F4F4F4;color:#111;line-height:1.55}
.logo{display:block;flex:none}
header.top{background:#000;color:#fff;padding:56px 24px 48px;text-align:center}
header.top .hero-logos{display:flex;gap:28px;justify-content:center;align-items:center;flex-wrap:wrap;margin:28px 0 20px}
header.top .whitebox{background:#fff;border-radius:16px;padding:22px 28px}
header.top h1{margin:0;font-size:30px}header.top p{margin:6px auto 0;max-width:760px;color:#CFCFCF}
main{max-width:1180px;margin:0 auto;padding:24px 16px 140px}
.q{background:#fff;border-radius:20px;padding:28px;margin:22px 0;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.q h2{margin:0 0 6px;font-size:22px;display:flex;align-items:center;gap:12px}
.qn{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#000;color:#FBB809;font-size:16px}
.intro{margin:0 0 18px;color:#555}
.opts{display:grid;gap:16px}.cols3{grid-template-columns:repeat(3,1fr)}.cols2{grid-template-columns:repeat(2,1fr)}
@media (max-width:900px){.cols3,.cols2{grid-template-columns:1fr}}
.opt{position:relative;display:flex;flex-direction:column;border:2px solid #E6E6E6;border-radius:16px;padding:14px;cursor:pointer;transition:border-color .15s,box-shadow .15s;background:#fff}
.opt:hover{border-color:#BDBDBD}
.opt input{position:absolute;opacity:0;pointer-events:none}
.opt:has(input:checked){border-color:#000;box-shadow:0 0 0 3px #FBB809}
.opt-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.code{font-weight:800;background:#000;color:#fff;border-radius:8px;padding:2px 9px;font-family:ui-monospace,Menlo,monospace}
.opt:has(input:checked) .code{background:#FBB809;color:#000}
.otitle{font-weight:700}
.rec{margin-inline-start:auto;font-size:12px;font-weight:700;background:#FFF4D1;color:#7A5600;border-radius:999px;padding:2px 10px}
.opt-body{flex:1;display:flex;justify-content:center;align-items:flex-start}
.note{margin:12px 0 0;font-size:14px;color:#555}
.duo,.stack{width:100%;display:flex;flex-direction:column;gap:10px}
.pane{display:flex;align-items:center;justify-content:center;gap:12px;border-radius:12px;padding:22px;min-height:120px}
.pane.dark{background:#000}.pane.light{background:#fff;border:1px solid #EEE}.pane.grey{background:#F5F5F5;min-height:80px}.pane.big{min-height:160px}
.sz{font-size:11px;color:#888;font-family:ui-monospace,monospace}
.phone{width:240px;height:440px;border:7px solid #111;border-radius:30px;overflow:hidden;background:#FAFAFA;display:flex;flex-direction:column;font-family:system-ui,sans-serif;position:relative}
.status{display:flex;justify-content:space-between;font-size:10px;padding:6px 14px 2px;background:#fff;color:#111}
.hdr{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 14px}
.hicons{font-size:16px;color:#111;letter-spacing:2px}
.apphdr.dark .hicons{color:#fff}
.pbody{flex:1;padding:12px;overflow:hidden}
.pcard{background:#fff;border-radius:12px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pimg{position:relative;height:150px;border-radius:8px;background:#F1F1F1;display:grid;place-items:center}
.pbadge{position:absolute;top:8px;left:8px;font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px}
.pname{font-size:13px;margin-top:8px}.pprice{font-size:13px;margin:2px 0 8px}.pprice b{color:#CF1322}.pprice s{color:#999;font-size:11px}
.pbtn{width:100%;border:0;border-radius:999px;padding:10px;font-weight:700;font-size:13px}
.ayweb{display:flex;align-items:center;gap:8px;padding:10px 12px;flex-wrap:wrap}
.aylabel{font-weight:800;font-size:13px}.aysearch{flex-basis:100%;background:rgba(255,255,255,.92);color:#666;border-radius:999px;padding:6px 12px;font-size:11px}
.hero{height:170px;border-radius:12px;background:linear-gradient(135deg,#222,#555);color:#fff;display:grid;place-items:center;font-size:12px;letter-spacing:2px}
.row3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.row3 i{height:80px;border-radius:10px;background:#EAEAEA}
.site{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid #EEE;border-radius:10px;padding:12px 14px;flex-wrap:wrap}
.site nav{font-size:12px;color:#444;flex:1}.sbtn{font-size:12px;font-weight:700;background:#000;color:#fff;border-radius:999px;padding:5px 12px}
.apphdr{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 14px;border-radius:10px;background:#fff;border:1px solid #EEE}
.apphdr.dark{background:#000;border-color:#000}
.home{display:grid;grid-template-columns:repeat(2,1fr);gap:18px 10px;background:linear-gradient(160deg,#3B4A6B,#1D2333);border-radius:16px;padding:22px 14px;width:100%}
.app{display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;font-size:11px}
.ic{width:56px;height:56px;display:block;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.35)}.ic.ghost{background:rgba(255,255,255,.25);border-radius:22%}
.fv{display:inline-block;flex:none}
.tab{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #DDD;border-radius:10px 10px 0 0;padding:8px 12px;font-size:12px;width:100%;max-width:300px;align-self:center}.tab .x{margin-inline-start:auto;color:#888}
.prev{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media (max-width:900px){.prev{grid-template-columns:1fr}}
.prev figure{margin:0}.prev figcaption{font-size:13px;color:#555;margin-top:6px}
.splash{height:220px;background:#000;border-radius:14px;display:grid;place-items:center}
.mail{height:220px;border:1px solid #EEE;border-radius:14px;overflow:hidden;background:#fff}.mailtop{background:#000;padding:16px;display:flex;justify-content:center}
.mailbody{padding:14px;font-size:13px}.mailbody span{color:#777;font-size:12px}.mailbody i,.invoice i{display:block;height:8px;background:#EEE;border-radius:4px;margin-top:10px}
.invoice{height:220px;border:1px solid #DDD;border-radius:4px;background:#fff;padding:18px;filter:grayscale(1)}.invtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;font-weight:800;letter-spacing:2px;font-size:12px}.invoice i.short{width:40%}
.footer{height:220px;background:#000;border-radius:14px;color:#BDBDBD;font-size:12px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px}
.onblue{height:220px;background:#0A63F5;border-radius:14px;color:#fff;font-size:12px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px}
.onphoto{height:220px;border-radius:14px;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0) 45%),linear-gradient(135deg,#C9A27E,#6E4F3A 60%,#2B211B);padding:16px}
.refgrid{display:grid;grid-template-columns:300px 300px 1fr;gap:20px;align-items:start}@media (max-width:900px){.refgrid{grid-template-columns:1fr}}
.refgrid figure{margin:0}.refgrid img{border-radius:14px;display:block;max-width:100%;height:auto}.refgrid figcaption{font-size:13px;color:#555;margin-top:6px;text-align:center}
.tilebox{background:#FDFDFC;border-radius:14px;width:300px;height:300px;display:grid;place-items:center}
.facts{margin:0;padding-inline-start:18px;font-size:14px}.facts li{margin-bottom:8px}.sw{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle}
code{background:#F2F2F2;border-radius:5px;padding:1px 6px;font-size:13px}
.bar{position:fixed;inset-inline:0;bottom:0;background:#000;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;z-index:5;box-shadow:0 -4px 16px rgba(0,0,0,.25)}
.bar .sel{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;color:#FBB809;direction:ltr}
.bar button{border:0;border-radius:999px;background:#FBB809;color:#000;font-weight:800;padding:10px 18px;font-size:14px;cursor:pointer}
.bar .ok{font-size:13px;color:#9FE3A8;min-width:70px}
"""

JS = """
const groups=['A','L','C','H','S','I','F'];
function current(){return groups.map(g=>{const el=document.querySelector('input[name="'+g+'"]:checked');return el?el.value:g+'?'}).join(' · ')}
function refresh(){document.getElementById('sel').textContent=current()}
document.addEventListener('change',refresh);refresh();
document.getElementById('copy').addEventListener('click',async()=>{
  const t='اختياراتي للشعار: '+current();const ok=document.getElementById('ok');
  try{await navigator.clipboard.writeText(t);ok.textContent='تنسخ ✓'}catch(e){
    const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');ok.textContent='تنسخ ✓'}catch(_){ok.textContent=t}ta.remove()}
  setTimeout(()=>ok.textContent='',2500)});
"""

HTML = f'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZAYROVI — اقتراحات الشعار Za.</title><style>{CSS}</style></head><body>
{SPRITE}
<header class="top">
  <h1>شعار ZAYROVI الجديد «Za.» — اقتراحات للاختيار</h1>
  <div class="hero-logos" dir="ltr">{use("za-dark", 120)}<div class="whitebox">{use("za-light", 90)}</div></div>
  <p>في كل سؤال اختار خيار واحد (المختار يتلوّن بالأصفر). الخيارات اللي فيها ★ هوما اقتراحاتي، ومختارة من الأول.
  في الآخر اضغط «انسخ اختياراتي» وابعثهملي في الشات.</p>
</header>
<main>{ref}{''.join(sections)}{previews}</main>
<div class="bar"><span>اختياراتك:</span><span class="sel" id="sel"></span><button id="copy" type="button">انسخ اختياراتي</button><span class="ok" id="ok" aria-live="polite"></span></div>
<script>{JS}</script></body></html>'''

(HERE / "ZAYROVI-Za-propositions.html").write_text(HTML, encoding="utf-8")
print("ok", len(HTML) // 1024, "KB")
