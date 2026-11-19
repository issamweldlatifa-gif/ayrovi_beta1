# Fullscreen Reel viewer — 19 November reference

The supplied 720×1600 captures are treated as 360dp at 2×. Geometry is local to the fullscreen Reel; inline cards, Publication and commerce UI keep their existing styles.

- Back: circular 40dp dimmed disc with a rounded chevron (44dp touch target), fixed under the safe status area. Top info uses the active video's actual caption; the page/player is not replaced.
- Shop: 48dp white pill with dark type/chevron when closed, black with white type/chevron when open. Text is not forced to an English width; it adapts to French and Arabic. Caption, pill and three actions share a single animated lift. Opening the tray never replaces the player.
- Rail: Share (connected nodes), sound, and options; 24dp optical glyphs, 44dp targets, 52dp pitch. Reactions (including long-press choices) and comments remain available from Options; double-tap remains a reaction.
- Card: 332×151dp at a 360dp viewport, 12dp inset, 12dp gap, 4dp preview of the next card. Full-width photo band at 30%, a plain outlined favorite, white background in both themes and separate hit targets. Reduced price styling only when a valid compare-at price exists in the API. No invented median price.
- Typography: existing SIL OFL Zayrovi Extracted Sans, regular 14/24 for the caption, regular 14/20 for publisher/follow, bold 16/21 for the pill, 14/13/14 for card brand/name/price. Noto Sans Arabic uses the same hierarchy, with the rail, caption and cards mirrored. The caption starts with one line and displays More only when text actually overflows.
