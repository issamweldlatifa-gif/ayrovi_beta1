# Publication / Hero — compact layout

Measurements below are at a 360 dp viewport. They are intentionally smaller than the earlier campaign layouts; the reference images guide the hierarchy and density, not a 1:1 copy.

| Surface | Previous | Compact |
|---|---:|---:|
| Editorial images | height depended on product count (162 / 252) | panoramic 162 or compact cover 290; editor chooses, independent of products |
| Editorial video | 336 high | 269 high; playback controls preserved |
| Editorial product rail | 107×154, gap 8, full three or two large product cards | ~103×148, gap 4, 16 dp peek when there is a fourth; photos + hearts only |
| Colored container | 164×236 tiles; 56 dp above tiles | 152×219; 16 dp above tiles; title 20, subtitle 14; prices remain |
| Sponsored duo | 348×167 banner; 56 dp before tiles | 320×128 banner; 12 dp before tiles; two equal priced cards |
| Cinema | 450 high, 34 dp headline | 320 high, 24 dp headline; edge-to-edge black video area, video uncropped |
| Home carousel | 274 wide, ~438 high | 266 wide, standard ~333 high (owned art keeps the square photo and a separate compact text band) |

`shared/publicationEditorial.ts` supplies the native and CRM simulator sizes. The legacy image blocks keep a compact panoramic default when the database is upgraded. In the CRM, choose **Format du visuel** and optionally enter **Description complète de la collection**. Only the short subtitle is rendered in the feed; a collection with no long description falls back to the subtitle.

Cover and caption lead to the real linked collection; individual thumbnails still go straight to the product page. The public collection endpoint shares feed eligibility / catalog mapping, preserving CRM order until a customer opts into sorting. Collection state (grid/list, brand, price order) is local to the screen. Public counts and update dates come from the actual API response, and unpublished collections return 404.
