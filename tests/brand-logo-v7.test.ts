/**
 * Logo v7 (14/11/2026) — le Z zébré remplace définitivement le cœur-poignée de main (v6) et l'ancien Z (2026-10).
 *
 * Verrouille : les originaux fournis (empreintes), le tracé partagé site / app / chargement statique, la
 * suppression des anciens logos, et les PIXELS des icônes livrées — silhouette, centrage, fond plat #0A0A0A,
 * zone sûre Android, icônes alpha (notification, monochrome) — pas seulement des noms de fichiers.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import {
  BRAND_SYMBOL,
  BRAND_SYMBOL_MAX_RADIUS,
  BRAND_SYMBOL_SOLID,
  BOOT_SYMBOL_TRANSFORM,
  SPLASH_SYMBOL,
} from "../client/src/design/brandSymbol";

const masterDir = "assets/brand/zayrovi-2026-11";
const master = JSON.parse(fs.readFileSync(`${masterDir}/logo.json`, "utf8"));
const read = (file: string) => fs.readFileSync(file, "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "node_modules" ? [] : walk(file)) : [file];
  });
const INK = "#0A0A0A";

/** Opening coordinates of the retired contours: enough to recognise them, not the drawings themselves. */
const RETIRED = {
  "heart-handshake v6": "M543.29 86.58C544.32 87.5 545.34 88.43 546.4 89.38",
  "Z 2026-10": "M 1537.9 0.4 C 1531.9 0.6 1484.5 3.1 1466.9 4.2",
};

type Pick = (r: number, g: number, b: number, a: number) => boolean;
const white: Pick = (r, g, b, a) => r > 160 && g > 160 && b > 160 && a > 160;
const ink: Pick = (r, g, b, a) => r < 90 && g < 90 && b < 90 && a > 160;

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
    .resize(160, 160, { fit: "fill" }).raw().toBuffer();
}
const reference = (shape: { viewBox: string; d: string }) =>
  normalised(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="770" height="800" viewBox="${shape.viewBox}"><path fill="white" d="${shape.d}"/></svg>`), white);
const iou = (a: Buffer, b: Buffer) => {
  let union = 0, inter = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] > 128, q = b[i] > 128;
    if (p || q) union++;
    if (p && q) inter++;
  }
  return inter / union;
};

describe("v7 zebra Z — master, sources and the retired logos", () => {
  test("pins the supplied originals and shares exact contours across web/native/static boot", () => {
    for (const part of ["symbol", "symbolSolid", "wordmark"]) {
      const shape = master[part];
      expect(createHash("sha256").update(fs.readFileSync(`${masterDir}/${shape.source}`)).digest("hex")).toBe(shape.sourceSha256);
    }
    expect(master.version).toBe("7.0");
    expect(master.symbol.source).toBe("source/z-zebra-black.jpeg");
    expect(fs.existsSync(`${masterDir}/source/z-zebra-white.jpg`)).toBe(true); // light reference, same identity
    expect(BRAND_SYMBOL.d).toBe(master.symbol.d);
    expect(BRAND_SYMBOL_SOLID.d).toBe(master.symbolSolid.d);
    expect(BRAND_SYMBOL_MAX_RADIUS).toBe(master.symbolSolid.maxRadius);
    expect(read("apps/mobile/src/design/brandSymbol.ts")).toBe(read("client/src/design/brandSymbol.ts"));
    expect(read("client/index.html")).toContain(`d="${BRAND_SYMBOL.d}"`);
    expect(read("client/index.html")).toContain(`transform="${BOOT_SYMBOL_TRANSFORM}"`);
    expect(read("apps/mobile/src/design/brandWordmark.ts")).toContain(JSON.stringify(master.wordmark.d));
    const lockup = read("client/public/media/logo-ayrovi-lockup-black.svg");
    expect(lockup).toContain(master.wordmark.d);
    expect(lockup).toContain(master.symbol.d);
    expect(lockup).not.toMatch(/<(?:text|line|polygon|rect)\b/); // outlined lowercase, no divider
    // The solid Z is an exact construction (lines + arcs), not a trace.
    expect(BRAND_SYMBOL_SOLID.d).toMatch(/^M[\d. ]+(?:[LA][\d. ]+)+Z$/);
    expect(BRAND_SYMBOL_SOLID.d.length).toBeLessThan(400);
  });

  test("the old logos are deleted permanently: no source, archive, public file, module or contour remains", () => {
    for (const gone of [
      `${masterDir}/source/symbol.png`,
      `${masterDir}/source/reference-lockup.png`,
      "assets/brand/archive",
      "client/public/media/logo-ayrovi-symbol-blue.svg",
      "client/src/design/zMark.ts",
      "apps/mobile/src/design/zMark.ts",
      "docs/zayrovi-heart-handshake-identity-2026-11-08.md",
    ]) expect(fs.existsSync(gone), gone).toBe(false);
    const files = [
      ...walk("client/src"), ...walk("apps/mobile/src"), ...walk("client/public"), ...walk("assets"),
      ...walk("scripts"), "client/index.html",
    ].filter((f) => /\.(?:tsx?|m?js|html|svg|json|txt|py)$/.test(f));
    for (const [name, fingerprint] of Object.entries(RETIRED))
      expect(files.filter((file) => read(file).includes(fingerprint)), name).toEqual([]);
    const sources = [...walk("client/src"), ...walk("apps/mobile/src")].filter((f) => /\.tsx?$/.test(f));
    expect(sources.filter((f) => /c(?:œ|oe)ur-poign|heart-handshake/i.test(read(f)))).toEqual([]);
  });

  test("page loading is the grey Z fitted inside its ring; only the arc animates, with reduced-motion support", () => {
    const loader = read("client/public/media/logo-ayrovi-loading.svg");
    expect(loader).toContain(`fill="#666666" d="${BRAND_SYMBOL.d}" transform="${BOOT_SYMBOL_TRANSFORM}"`);
    expect(loader).toContain("@media(prefers-reduced-motion:reduce){.arc{animation:none}}");
    const scale = Number(BOOT_SYMBOL_TRANSFORM.match(/scale\(([\d.]+)\)/)![1]);
    expect(BRAND_SYMBOL_MAX_RADIUS * scale).toBeLessThanOrEqual(52.01); // ring r = 65, arc 6 wide
    expect(read("client/src/shop/LoadingView.tsx")).toContain("<BrandLoadingIndicator size={64} />");
    expect(read("apps/mobile/src/design/states.tsx")).toContain("BrandLoadingIndicator");
    expect(read("apps/mobile/src/features/publications/PublicationTemplatesScreen.tsx")).toContain("<LoadingBlock");
  });
});

describe("v7 zebra Z — shipped pixels", () => {
  test.each([
    ["apps/mobile/assets/images/icon.png", white, "striped"],
    ["apps/mobile/assets/images/adaptive-icon.png", white, "striped"],
    ["apps/mobile/assets/images/splash-icon.png", white, "striped"],
    ["apps/mobile/assets/images/splash-icon-dark.png", white, "striped"],
    ["client/public/media/logo-ayrovi-192.png", white, "striped"],
    ["client/public/media/logo-ayrovi-512.png", white, "striped"],
    ["client/public/media/logo-ayrovi-apple-touch.png", white, "striped"],
    ["client/public/media/logo-ayrovi.png", ink, "striped"],
    ["client/public/media/logo-ayrovi-light.png", white, "striped"],
    ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", white, "striped"],
    ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", white, "striped"],
    ["assets/icon.png", white, "striped"],
    ["apps/mobile/assets/images/notification-icon.png", white, "solid"],
    ["apps/mobile/assets/images/adaptive-icon-monochrome.png", white, "solid"],
    ["apps/mobile/assets/images/favicon.png", white, "solid"],
  ] as const)("%s draws the actual Z (%s), centred", async (file, pick, kind) => {
    const expected = await reference(kind === "solid" ? BRAND_SYMBOL_SOLID : BRAND_SYMBOL);
    const { info, box } = await mask(file, pick);
    // Stripes are anti-aliased at <= 192 px; larger assets must match tightly. Both reject any other drawing.
    expect(iou(await normalised(file, pick), expected)).toBeGreaterThan(info.width <= 192 ? 0.75 : 0.92);
    const cx = (box.left + box.right + 1) / 2 / info.width;
    const cy = (box.top + box.bottom + 1) / 2 / info.height;
    expect(Math.abs(cx - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(cy - 0.5)).toBeLessThan(0.01);
  });

  test.each([
    "apps/mobile/assets/images/icon.png",
    "client/public/media/logo-ayrovi-512.png",
    "assets/icon.png",
    "assets/splash.png",
  ])("%s has a flat #0A0A0A background (no gradient)", async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { box } = await mask(file, white);
    const pad = Math.ceil(info.width * 0.01);
    let off = 0, total = 0;
    for (let y = 0; y < info.height; y += 2)
      for (let x = 0; x < info.width; x += 2) {
        if (x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad) continue;
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
    expect(farthest).toBeGreaterThan(safe * 0.8); // and still fills it
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
  });

  test("Expo config: dark adaptive icon + themed monochrome, dark splash in both themes, notification icon", () => {
    const expo = JSON.parse(read("apps/mobile/app.json")).expo;
    expect(expo.icon).toBe("./assets/images/icon.png");
    expect(expo.android.adaptiveIcon).toEqual({
      foregroundImage: "./assets/images/adaptive-icon.png",
      monochromeImage: "./assets/images/adaptive-icon-monochrome.png",
      backgroundColor: INK,
    });
    const plugin = (name: string) => expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === name)?.[1];
    const splash = plugin("expo-splash-screen");
    expect(splash.backgroundColor).toBe(INK);
    expect(splash.dark.backgroundColor).toBe(INK);
    expect(splash.imageWidth).toBe(SPLASH_SYMBOL.imageWidth);
    expect(SPLASH_SYMBOL.background).toBe(INK);
    expect(plugin("expo-notifications")).toEqual({ icon: "./assets/images/notification-icon.png", color: INK });
    for (const file of [expo.icon, expo.web.favicon, splash.image, splash.dark.image, ...Object.values(expo.android.adaptiveIcon).filter((v) => String(v).startsWith("./")), plugin("expo-notifications").icon])
      expect(fs.existsSync(path.join("apps/mobile", String(file))), String(file)).toBe(true);
    expect(read("android/app/src/main/res/values/ic_launcher_background.xml")).toContain(`>${INK}<`);
    expect(read("package.json")).toContain("--iconBackgroundColor '#0A0A0A' --iconBackgroundColorDark '#0A0A0A' --splashBackgroundColor '#0A0A0A' --splashBackgroundColorDark '#0A0A0A'");
  });

  test("official avatars on the site use the round-fitted Z, never the retired blue symbol", () => {
    for (const file of ["StoryFeed", "ReelsViewer", "FullscreenMediaHeader", "StoryCircles"])
      expect(read(`client/src/social/components/${file}.tsx`)).toContain('src="/media/logo-ayrovi-avatar.svg?v=7.0"');
    const avatar = read("client/public/media/logo-ayrovi-avatar.svg");
    expect(avatar).toContain(`fill="${INK}" d="${BRAND_SYMBOL.d}"`);
    const scale = Number(avatar.match(/scale\(([\d.]+)\)/)![1]);
    expect(BRAND_SYMBOL_MAX_RADIUS * scale).toBeLessThanOrEqual(512 * 0.4 + 0.01); // inside the circle
  });
});
