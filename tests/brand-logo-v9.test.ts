/**
 * Logo v9 « Za. » (18/11/2026) — official logo supplied by the owner in two renderings: on white (white z, ink a)
 * and on black (black z, white a); yellow circle and dot in both. Replaces the zebra Z (v8, 15/11) and every
 * earlier mark.
 *
 * Pins: the supplied originals (hashes), ONE master shared by web / native / static boot / server documents, the
 * z cut out of the circle and open to the outside (its lower bar always crosses the edge), the retired logos'
 * removal, and the PIXELS of the shipped icons: yellow silhouette, centring, flat black backgrounds, Android safe
 * zone, alpha masks.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { BRAND_LOGO, BRAND_MARK, BOOT_MARK_TRANSFORM, SOCIAL_ICON, SPLASH_LOGO } from "../client/src/design/brandSymbol";
import { BRAND_LOGO_EMAIL, BRAND_LOGO_SVG } from "../shared/brandLogo.generated";

const masterDir = "assets/brand/zayrovi-2026-11";
const master = JSON.parse(fs.readFileSync(`${masterDir}/logo.json`, "utf8"));
const read = (file: string) => fs.readFileSync(file, "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "node_modules" ? [] : walk(file)) : [file];
  });
const INK = "#0A0A0A";
const WHITE = "#FFFFFF";
const YELLOW = "#F2AE00";

/** Opening coordinates of the retired contours: enough to recognise them, not the drawings themselves. */
const RETIRED = {
  "heart-handshake v6": "M543.29 86.58C544.32 87.5 545.34 88.43 546.4 89.38",
  "Z 2026-10": "M 1537.9 0.4 C 1531.9 0.6 1484.5 3.1 1466.9 4.2",
  "zebra Z v7": "M806 0C807 0 807 0 808 0C808 0 809 0 809 0C810 0 811 0 811 0C812 0 812",
  "zebra Z v7 solid": "M147.02 0L834.85 0A127.59 127.59 0 0 1 929.92 212.68",
};

type Pick = (r: number, g: number, b: number, a: number) => boolean;
const yellow: Pick = (r, g, b, a) => r > 200 && g > 130 && g < 210 && b < 90 && a > 160;
const white: Pick = (r, g, b, a) => r > 160 && g > 160 && b > 160 && a > 160;

async function mask(input: string | Buffer, pick: Pick) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  const m = Buffer.alloc(info.width * info.height);
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (pick(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        m[y * info.width + x] = 255;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  expect(right).toBeGreaterThan(left);
  return { m, data, info, box: { left, top, right, bottom } };
}
async function normalised(input: string | Buffer, pick: Pick) {
  const { m, info, box } = await mask(input, pick);
  return sharp(m, { raw: { width: info.width, height: info.height, channels: 1 } })
    .extract({ left: box.left, top: box.top, width: box.right - box.left + 1, height: box.bottom - box.top + 1 })
    .resize(160, 100, { fit: "fill" }).raw().toBuffer();
}
/** Yellow parts of a reference drawing (logo: ring + dot; mark: ring). */
const reference = (kind: "logo" | "mark") => {
  const body = kind === "logo"
    ? `<path fill="${YELLOW}" d="${BRAND_LOGO.ring}"/><path fill="${YELLOW}" d="${BRAND_LOGO.dot}"/>`
    : `<path fill="${YELLOW}" d="${BRAND_MARK.d}"/>`;
  const vb = kind === "logo" ? BRAND_LOGO.viewBox : BRAND_MARK.viewBox;
  const [, , w, h] = vb.split(" ").map(Number);
  return normalised(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w / 2)}" height="${Math.round(h / 2)}" viewBox="${vb}">${body}</svg>`), yellow);
};
const iou = (a: Buffer, b: Buffer) => {
  let union = 0, inter = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] > 128, q = b[i] > 128;
    if (p || q) union++;
    if (p && q) inter++;
  }
  return inter / union;
};

describe("v9 « Za. » — master, sources and the retired logos", () => {
  test("pins the two supplied originals and shares ONE master across web, native, boot and documents", () => {
    expect(master.version).toBe("9.0");
    expect(Object.keys(master.sources).sort()).toEqual(["dark", "light"]);
    for (const source of Object.values(master.sources) as { file: string; sha256: string }[])
      expect(createHash("sha256").update(fs.readFileSync(`${masterDir}/${source.file}`)).digest("hex")).toBe(source.sha256);
    expect(master.colors).toMatchObject({ yellow: YELLOW, ink: INK, white: WHITE });
    expect(BRAND_LOGO.ring).toBe(master.logo.ring);
    expect(BRAND_LOGO.a).toBe(master.logo.a);
    expect(BRAND_LOGO.dot).toBe(master.logo.dot);
    expect(BRAND_MARK.d).toBe(BRAND_LOGO.ring);
    expect(read("apps/mobile/src/design/brandSymbol.ts")).toBe(read("client/src/design/brandSymbol.ts"));
    expect(read("client/index.html")).toContain(`transform="${BOOT_MARK_TRANSFORM}" d="${BRAND_MARK.d}"`);
    for (const tone of ["light", "dark"] as const) expect(BRAND_LOGO_SVG[tone]).toContain(`d="${BRAND_LOGO.a}"`);
    expect(read("apps/mobile/src/design/tokens.generated.ts")).toContain(`yellow: "${YELLOW}"`);
    expect(read("client/src/design/editorial/tokens.generated.css")).toContain(`--ay-e-brand-yellow: ${YELLOW};`);
  });

  test("the z is cut out of the circle and open to the outside: one contour, its lower bar crosses the edge", () => {
    const ring = BRAND_LOGO.ring;
    expect(ring.match(/M/g)).toHaveLength(1);
    const arc = ring.match(/^M([\d.]+) ([\d.]+)A500 500 0 1 0 ([\d.]+) ([\d.]+)L/)!;
    expect(arc).not.toBeNull();
    const [x1, y1, x2, y2] = arc.slice(1).map(Number);
    // Both ends of the bar sit ON the circle (r = 500 around 500,500), on its right side, one bar-height apart.
    expect(Math.hypot(x1 - 500, y1 - 500)).toBeCloseTo(500, 0);
    expect(Math.hypot(x2 - 500, y2 - 500)).toBeCloseTo(500, 0);
    expect(Math.min(x1, x2)).toBeGreaterThan(900);
    expect(y2 - y1).toBeGreaterThan(90);
    // Owner rule written into the master.
    expect(master.rules.z).toMatch(/sort toujours du cercle/);
    // The a sits apart from the circle (a gap, no overlap).
    expect(master.logo.aBox[0]).toBeGreaterThan(1000);
  });

  test("renderings: light = ink a, dark = white a; circle and dot always yellow", () => {
    const light = read("client/public/media/logo-zayrovi-logo-light.svg");
    const dark = read("client/public/media/logo-zayrovi-logo-dark.svg");
    expect(light).toContain(`<path fill="${INK}" d="${BRAND_LOGO.a}"/>`);
    expect(dark).toContain(`<path fill="${WHITE}" d="${BRAND_LOGO.a}"/>`);
    for (const svg of [light, dark]) {
      expect(svg).toContain(`<path fill="${YELLOW}" d="${BRAND_LOGO.ring}"/>`);
      expect(svg).toContain(`<path fill="${YELLOW}" d="${BRAND_LOGO.dot}"/>`);
      expect(svg).not.toMatch(/<(?:text|rect|image)\b/); // no background, no live text
    }
    // Historical names now carry the official logo by surface tone (stored configs keep working).
    expect(read("client/public/media/logo-zayrovi-lockup-black-violet.svg")).toBe(light);
    expect(read("client/public/media/logo-zayrovi-lockup-white-violet.svg")).toBe(dark);
    expect(read("client/public/media/logo-zayrovi-wordmark-white.svg")).toBe(dark);
  });

  test("the old logos are deleted permanently: no source, module or contour remains", () => {
    for (const gone of [
      `${masterDir}/source/z-zebra-black-v8.jpg`,
      `${masterDir}/source/wordmark.jpg`,
      `${masterDir}/source/symbol.png`,
      "apps/mobile/src/design/brandWordmark.ts",
      "client/src/design/zMark.ts",
      "apps/mobile/src/design/zMark.ts",
    ]) expect(fs.existsSync(gone), gone).toBe(false);
    const files = [
      ...walk("client/src"), ...walk("apps/mobile/src"), ...walk("client/public"), ...walk("assets"),
      ...walk("scripts"), "client/index.html",
    ].filter((f) => /\.(?:tsx?|m?js|html|svg|json|txt|py|webmanifest)$/.test(f));
    for (const [name, fingerprint] of Object.entries(RETIRED))
      expect(files.filter((file) => read(file).includes(fingerprint)), name).toEqual([]);
    expect(files.filter((f) => /\?v=8\.0/.test(read(f)))).toEqual([]);
  });

  test("page loading: the yellow symbol inside its ring; only the arc animates, with reduced-motion support", () => {
    const loader = read("client/public/media/logo-zayrovi-loading.svg");
    expect(loader).toContain(`fill="${YELLOW}" d="${BRAND_MARK.d}" transform="${BOOT_MARK_TRANSFORM}"`);
    expect(loader).toContain("@media(prefers-reduced-motion:reduce){.arc{animation:none}}");
    const scale = Number(BOOT_MARK_TRANSFORM.match(/scale\(([\d.]+)\)/)![1]);
    expect(500 * scale).toBeLessThanOrEqual(52.01); // ring r = 65, arc 6 wide
    expect(read("client/index.html")).toContain(`.ay-boot-symbol { fill: ${YELLOW}; }`);
    expect(read("client/src/shop/LoadingView.tsx")).toContain("<BrandLoadingIndicator size={64} />");
  });

  test("placements: headers, auth, footer, admin, e-mails and invoices carry the official logo", () => {
    const nav = read("client/src/components/Navbar.tsx");
    expect(nav).toContain("overHero ? '/media/logo-zayrovi-logo-dark.svg?v=9.0' : '/media/logo-zayrovi-logo-light.svg?v=9.0'");
    expect(nav).toContain('className="h-8 w-auto object-contain"'); // home: 32 px, slightly larger than the 28 px headers
    expect(read("client/src/components/Footer.tsx")).toContain('src="/media/logo-zayrovi-logo-dark.svg?v=9.0"');
    expect(read("client/src/admin/AdminApp.tsx")).toContain("/media/logo-zayrovi-logo-dark.svg?v=9.0");
    expect(read("client/src/components/CustomerAccountPage.tsx")).toContain("/media/logo-zayrovi-logo-light.svg?v=9.0");
    expect(read("src/services/invoice.ts")).toContain("${BRAND_LOGO_SVG.light}");
    expect(read("src/customer/accountMail.ts")).toContain("BRAND_LOGO_EMAIL.path");
    expect(BRAND_LOGO_EMAIL.path).toBe("/media/logo-zayrovi-email-dark.png?v=9.0");
    const html = read("client/index.html");
    expect(html).toContain('<meta property="og:image" content="https://zayrovi.com/media/og-zayrovi.png?v=9.0" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/media/logo-zayrovi-icon.svg?v=9.0" />');
    expect(read("apps/mobile/src/features/shell/AppHeader.tsx")).toContain("pathname === '/' ? LOGO_SIZE.home : LOGO_SIZE.header");
  });
});

describe("v9 « Za. » — shipped pixels", () => {
  test.each([
    ["apps/mobile/assets/images/icon.png", "logo"],
    ["apps/mobile/assets/images/adaptive-icon.png", "logo"],
    ["apps/mobile/assets/images/splash-icon.png", "logo"],
    ["apps/mobile/assets/images/splash-icon-dark.png", "logo"],
    ["client/public/media/logo-zayrovi-192.png", "logo"],
    ["client/public/media/logo-zayrovi-512.png", "logo"],
    ["client/public/media/logo-zayrovi-apple-touch.png", "logo"],
    ["client/public/media/og-zayrovi.png", "logo"],
    ["client/public/media/logo-zayrovi-email-dark.png", "logo"],
    ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", "logo"],
    ["assets/icon.png", "logo"],
    ["assets/splash.png", "logo"],
    ["client/public/media/logo-zayrovi.png", "mark"],
    ["apps/mobile/assets/images/favicon.png", "mark"],
  ] as const)("%s draws the actual yellow %s, centred", async (file, kind) => {
    const expected = await reference(kind);
    const { info, box } = await mask(file, yellow);
    expect(iou(await normalised(file, yellow), expected)).toBeGreaterThan(info.width <= 192 ? 0.85 : 0.93);
    // The logo is centred by its bounding box, which includes the a (not yellow): its yellow parts sit left of centre.
    const cy = (box.top + box.bottom + 1) / 2 / info.height;
    expect(Math.abs(cy - 0.5)).toBeLessThan(0.01);
    if (kind === "mark") expect(Math.abs((box.left + box.right + 1) / 2 / info.width - 0.5)).toBeLessThan(0.01);
  });

  test.each([
    "apps/mobile/assets/images/icon.png",
    "client/public/media/logo-zayrovi-512.png",
    "assets/icon.png",
    "assets/splash.png",
  ])("%s has a flat #0A0A0A background around the logo (no gradient)", async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { box } = await mask(file, yellow);
    const pad = Math.ceil(info.width * 0.01);
    let off = 0, total = 0;
    for (let y = 0; y < info.height; y += 2)
      for (let x = 0; x < info.width; x += 2) {
        if (y >= box.top - pad && y <= box.bottom + pad) continue; // the logo's band (circle, a, dot)
        const i = (y * info.width + x) * 4;
        total++;
        if (data[i] !== 10 || data[i + 1] !== 10 || data[i + 2] !== 10 || data[i + 3] !== 255) off++;
      }
    expect(total).toBeGreaterThan(1000);
    expect(off).toBe(0);
  });

  test.each([
    "apps/mobile/assets/images/adaptive-icon.png",
    "apps/mobile/assets/images/adaptive-icon-monochrome.png",
  ])("%s keeps every painted pixel inside the Android 66 dp safe zone", async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = info.width / 2, safe = (33 / 108) * info.width;
    let farthest = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > 0) farthest = Math.max(farthest, Math.hypot(x + 0.5 - c, y + 0.5 - c));
    expect(farthest).toBeLessThanOrEqual(safe);
    expect(farthest).toBeGreaterThan(safe * 0.85); // and still fills it
  });

  test.each([
    "apps/mobile/assets/images/notification-icon.png",
    "apps/mobile/assets/images/adaptive-icon-monochrome.png",
  ])("%s is an alpha mask: white only, transparent background (Android tints it)", async (file) => {
    const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      painted++;
      expect(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255).toBe(true);
    }
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(data.length / 4 / 2);
    await mask(file, white);
  });

  test("Expo + Android config: black launch surfaces (dark master), themed monochrome, notification icon", () => {
    const expo = JSON.parse(read("apps/mobile/app.json")).expo;
    expect(expo.icon).toBe("./assets/images/icon.png");
    expect(expo.backgroundColor).toBe(WHITE); // the app's root canvas stays white
    expect(expo.android.adaptiveIcon).toEqual({
      foregroundImage: "./assets/images/adaptive-icon.png",
      monochromeImage: "./assets/images/adaptive-icon-monochrome.png",
      backgroundColor: INK,
    });
    const plugin = (name: string) => expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === name)?.[1];
    const splash = plugin("expo-splash-screen");
    expect(splash.backgroundColor).toBe(INK);
    expect(splash.dark.backgroundColor).toBe(INK);
    expect(splash.imageWidth).toBe(SPLASH_LOGO.imageWidth);
    const entrance = read("apps/mobile/src/design/BrandEntrance.tsx");
    expect(entrance).toContain("backgroundColor: BRAND.black, alignItems"); // the JS redraw of the splash
    expect(entrance).toContain('<BrandLogo height={SPLASH_LOGO.height} tone="dark" />');
    expect(plugin("expo-notifications")).toEqual({ icon: "./assets/images/notification-icon.png", color: INK });
    for (const file of [expo.icon, expo.web.favicon, splash.image, splash.dark.image, ...Object.values(expo.android.adaptiveIcon).filter((v) => String(v).startsWith("./")), plugin("expo-notifications").icon])
      expect(fs.existsSync(path.join("apps/mobile", String(file))), String(file)).toBe(true);
    expect(read("android/app/src/main/res/values/ic_launcher_background.xml")).toContain(`>${INK}<`);
    expect(read("package.json")).toContain("--iconBackgroundColor '#0A0A0A' --iconBackgroundColorDark '#0A0A0A' --splashBackgroundColor '#0A0A0A' --splashBackgroundColorDark '#0A0A0A'");
  });

  test("official avatars (site + app) = the social icon: black rounded tile, mark + yellow dot closer (gap = dot diameter)", () => {
    for (const file of ["StoryFeed", "ReelsViewer", "FullscreenMediaHeader", "StoryCircles"])
      expect(read(`client/src/social/components/${file}.tsx`)).toContain('src="/media/logo-zayrovi-avatar.svg?v=9.1"');
    const avatar = read("client/public/media/logo-zayrovi-avatar.svg");
    expect(avatar).toContain(`<rect width="512" height="512" rx="${512 * SOCIAL_ICON.radius}" fill="${INK}"/>`);
    expect(avatar).toContain(`fill="${YELLOW}" d="${BRAND_MARK.d}"`);
    expect(avatar).toContain(`<circle cx="${SOCIAL_ICON.dot.cx}" cy="${SOCIAL_ICON.dot.cy}" r="${SOCIAL_ICON.dot.r}" fill="${YELLOW}"/>`);
    // The dot: same radius and height as the logo's; the gap to the circle's edge (at that height) = its diameter.
    const [, dotY, dotR] = BRAND_LOGO.dot.match(/^M[\d.]+ ([\d.]+)A([\d.]+)/)!.map(Number);
    expect(SOCIAL_ICON.dot.r).toBe(dotR);
    expect(SOCIAL_ICON.dot.cy).toBe(dotY);
    const edge = 500 + Math.sqrt(500 ** 2 - (dotY - 500) ** 2);
    expect(SOCIAL_ICON.dot.cx - dotR - edge).toBeCloseTo(2 * dotR, 0);
    const scale = Number(avatar.match(/scale\(([\d.]+)\)/)![1]);
    expect(SOCIAL_ICON.width * scale).toBeCloseTo(512 * SOCIAL_ICON.content, 1);
    const native = read("apps/mobile/src/design/OfficialAvatar.tsx");
    expect(native).toContain("rx={size * SOCIAL_ICON.radius} fill={BRAND.black}");
    expect(native).toContain("<Path d={BRAND_MARK.d} fill={BRAND.yellow} />");
    expect(native).toContain("<Circle cx={SOCIAL_ICON.dot.cx} cy={SOCIAL_ICON.dot.cy} r={SOCIAL_ICON.dot.r} fill={BRAND.yellow} />");
    expect(read("apps/mobile/src/features/reels/ReelPublisher.tsx")).toContain("<OfficialAvatar size={OFFICIAL_AVATAR.reel}");
  });
});
