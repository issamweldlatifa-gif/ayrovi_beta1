# Reference navigation icon update

Supersedes the earlier selected-blue Home / AYWEBs paw / Sonim appearance only; five destination actions, hidden Social route, storage keys and APIs remain intact.

- Home keeps the original supplied contour, always black in light mode / white in dark mode. It is a filled brand contour, not a newly invented outline; camera/search/profile use a shared 2.2-unit rounded stroke to harmonize their visual weight with it, in the same 24-point slot. Selection never turns these four icons blue or gray.
- Lens uses the supplied broken-camera/ring motif; AYWEBs uses the supplied magnifier/sparkle motif instead of the paw. Both are lightweight vectors, not large screenshot bitmaps.
- Profile uses the same stroke, cap, join and theme ink as camera/search.
- Clean replaces Sonim in mobile translated copy and screen headings, and public web assistant headings/default navigation copy, plus the assistant’s server-side self-identification prompt. Its turquoise/orange message/sparkle vector is the explicitly approved **local color exception**; no global commerce theme changes. Reference colors are approximations from the raster, not a claim of exact source RGB. Stable Sonim route names, conversation state, APIs and compatibility icon exports are intentionally retained.
- Official Publication/Reel publisher brand symbols use shared Verified blue (#0095F6), native and public web; actual non-official publisher avatars/names are untouched. Social is not added back to the tab bar.
- Supplied originals are preserved under `assets/brand/navigation-reference/`. The retired AYWEBs icon rasters are intentionally retained for future use, not injected into current navigation just to satisfy the old orphan-asset assertion. Existing AYWEBs header/cart-sheet wordmarks remain unchanged.

Validation: mobile TypeScript, 47 UI suites / 297 tests, 116 unit files / 1,148 tests; root TypeScript, production build, 4 targeted brand/icon/color/reference suites / 207 tests and design/icon/identity checks. Existing Jest act/open-handle warnings remain. Android and iOS Hermes exports also passed (5.2MB / 4.9MB); these checks do not prove a fresh APK installation or visual correctness on a physical phone.
