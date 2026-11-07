import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import {
  BRAND_SYMBOL,
  BOOT_SYMBOL_TRANSFORM,
} from "../client/src/design/brandSymbol";
const masterDir = "assets/brand/zayrovi-2026-11";
const master = JSON.parse(fs.readFileSync(`${masterDir}/logo.json`, "utf8"));
const read = (file: string) => fs.readFileSync(file, "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? walk(file) : [file];
  });

describe("v6 heart-handshake replaces the retired Z, including grey page loading", () => {
  test("pins the supplied originals and shares exact contours across web/native/static boot", () => {
    for (const part of ["symbol", "wordmark"]) {
      const shape = master[part];
      expect(
        createHash("sha256")
          .update(fs.readFileSync(`${masterDir}/${shape.source}`))
          .digest("hex")
      ).toBe(shape.sourceSha256);
    }
    expect(BRAND_SYMBOL.d).toBe(master.symbol.d);
    expect(read("apps/mobile/src/design/brandSymbol.ts")).toBe(
      read("client/src/design/brandSymbol.ts")
    );
    expect(read("client/index.html")).toContain(`d="${BRAND_SYMBOL.d}"`);
    expect(read("client/index.html")).toContain(
      `transform="${BOOT_SYMBOL_TRANSFORM}"`
    );
    expect(read("apps/mobile/src/design/brandWordmark.ts")).toContain(
      JSON.stringify(master.wordmark.d)
    );
    const lockup = read("client/public/media/logo-ayrovi-lockup-black.svg");
    expect(lockup).toContain(master.wordmark.d);
    expect(lockup).toContain(master.symbol.d);
    expect(lockup).not.toMatch(/<(?:text|line|polygon|rect)\b/); // outlined lowercase, no divider
  });

  test("does not ship the retired contour/module in any active web/native source or public SVG", () => {
    const retired = read(
      "assets/brand/archive/2026-10/retired-symbol.txt"
    ).match(/d: '([^']+)'/)![1];
    const files = [
      ...walk("client/src"),
      ...walk("apps/mobile/src"),
      ...walk("client/public"),
      "client/index.html",
    ].filter((f) => /\.(?:tsx?|html|svg)$/.test(f));
    expect(files.filter((file) => read(file).includes(retired))).toEqual([]);
    expect(fs.existsSync("client/src/design/zMark.ts")).toBe(false);
    expect(fs.existsSync("apps/mobile/src/design/zMark.ts")).toBe(false);
  });

  test("page loading is grey and animates only its arc, with reduced-motion support", () => {
    const loader = read("client/public/media/logo-ayrovi-loading.svg");
    expect(loader).toContain(`fill="#666666" d="${BRAND_SYMBOL.d}"`);
    expect(loader).toContain(
      "@media(prefers-reduced-motion:reduce){.arc{animation:none}}"
    );
    expect(read("client/src/shop/LoadingView.tsx")).toContain(
      "<BrandLoadingIndicator size={64} />"
    );
    expect(read("apps/mobile/src/design/states.tsx")).toContain(
      "BrandLoadingIndicator"
    );
    expect(
      read("apps/mobile/src/features/publications/PublicationFeedback.tsx")
    ).toContain("color={P.muted}");
  });

  test.each([
    "apps/mobile/assets/images/icon.png",
    "apps/mobile/assets/images/adaptive-icon.png",
    "apps/mobile/assets/images/splash-icon.png",
    "apps/mobile/assets/images/splash-icon-dark.png",
    "client/public/media/logo-ayrovi-192.png",
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    "assets/icon.png",
  ])(
    "%s has the actual new silhouette, not just a changed filename",
    async (file) => {
      async function silhouette(input: string | Buffer) {
        const { data, info } = await sharp(input)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        let left = info.width,
          top = info.height,
          right = 0,
          bottom = 0;
        const mask = Buffer.alloc(info.width * info.height);
        for (let y = 0; y < info.height; y++)
          for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * 4;
            if (
              data[i] > 180 &&
              data[i + 1] > 180 &&
              data[i + 2] > 180 &&
              data[i + 3] > 180
            ) {
              mask[y * info.width + x] = 255;
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        expect(right).toBeGreaterThan(left);
        return sharp(mask, {
          raw: { width: info.width, height: info.height, channels: 1 },
        })
          .extract({
            left,
            top,
            width: right - left + 1,
            height: bottom - top + 1,
          })
          .resize(128, 128, { fit: "fill" })
          .raw()
          .toBuffer();
      }
      const expected = await silhouette(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="${BRAND_SYMBOL.viewBox}"><path fill="white" d="${BRAND_SYMBOL.d}"/></svg>`
        )
      );
      const actual = await silhouette(file);
      let union = 0,
        intersection = 0;
      for (let i = 0; i < expected.length; i++) {
        if (expected[i] > 128 || actual[i] > 128) union++;
        if (expected[i] > 128 && actual[i] > 128) intersection++;
      }
      // At <=192px, a one-pixel threshold/antialias shift affects narrow fingers noticeably.
      // High-resolution assets must match more tightly; both thresholds reject the retired Z.
      const { width = 0 } = await sharp(file).metadata();
      expect(intersection / union).toBeGreaterThan(width <= 192 ? 0.9 : 0.92);
    }
  );
});
