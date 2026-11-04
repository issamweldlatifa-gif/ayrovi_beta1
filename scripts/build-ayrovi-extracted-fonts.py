#!/usr/bin/env python3
"""Build Ayrovi font assets from the verified site WOFF2, not from filename labels.

The variable web font keeps the original glyph outlines/metrics and receives an
Ayrovi family name. Static mobile/PDF TTFs are axis instances of that exact WOFF2.
Requires: python -m pip install 'fonttools[woff]>=4.67'
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/fonts/source/extracted-site-variable-v1.7.woff2"
SOURCE_SHA256 = "ba6fc11db691debbd271564b194e37d96fab6d3d58c96574c58ce15696196a8f"
WEB_OUT = ROOT / "client/public/fonts/editorial/ayrovi-extracted-sans.woff2"
APP_DIR = ROOT / "apps/mobile/assets/fonts"
PDF_DIR = ROOT / "assets/fonts"
IDENTITY_PATH = ROOT / "client/src/design/editorial/identity.json"
TYPOGRAPHY = json.loads(IDENTITY_PATH.read_text(encoding="utf-8"))["typography"]
MOBILE_WIDTH = float(TYPOGRAPHY["bodyWidth"].rstrip("%"))
HEADING_WIDTH = float(TYPOGRAPHY["headingWidth"].rstrip("%"))
STATIC_INSTANCES = (
    (int(TYPOGRAPHY["bodyWeight"]), "Regular", MOBILE_WIDTH),
    (int(TYPOGRAPHY["headingWeight"]), "Medium", MOBILE_WIDTH),
    (int(TYPOGRAPHY["labelWeight"]), "SemiBold", MOBILE_WIDTH),
    (700, "Bold", MOBILE_WIDTH),
    (int(TYPOGRAPHY["headingWeight"]), "Heading", HEADING_WIDTH),
)
FAMILY = "Ayrovi Extracted Sans"
PS_PREFIX = "AyroviExtractedSans"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def name(font: TTFont, name_id: int, value: str) -> None:
    records = [record for record in font["name"].names if record.nameID == name_id]
    for record in records:
        record.string = value.encode(record.getEncoding())
    if not records:
        font["name"].setName(value, name_id, 3, 1, 0x0409)


def rebrand(font: TTFont, subfamily: str) -> None:
    full_name = f"{FAMILY} {subfamily}" if subfamily != "Regular" else FAMILY
    ps_name = f"{PS_PREFIX}-{subfamily}" if subfamily != "Regular" else PS_PREFIX
    values = {
        1: FAMILY, 2: subfamily,
        3: f"{FAMILY} 1.700; {subfamily}",
        4: full_name, 6: ps_name,
        16: FAMILY, 17: subfamily, 25: PS_PREFIX,
    }
    for name_id, value in values.items():
        name(font, name_id, value)
    if "OS/2" in font:
        font["OS/2"].achVendID = "AYRV"


def outline_signature(font: TTFont) -> tuple[dict[int, tuple], dict[str, tuple[int, int]]]:
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    outlines: dict[int, tuple] = {}
    for codepoint, glyph_name in sorted(cmap.items()):
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        outlines[codepoint] = tuple(pen.value)
    metrics = {glyph_name: tuple(font["hmtx"].metrics[glyph_name]) for glyph_name in font.getGlyphOrder()}
    return outlines, metrics


def flatten(value):
    if isinstance(value, (tuple, list)):
        for item in value:
            yield from flatten(item)
    else:
        yield float(value)


def assert_same_geometry(left: TTFont, right: TTFont, tolerance: float = 1.0) -> float:
    left_outlines, left_metrics = outline_signature(left)
    right_outlines, right_metrics = outline_signature(right)
    if left_outlines.keys() != right_outlines.keys() or left_metrics != right_metrics:
        raise SystemExit("Glyph coverage or advance metrics changed during font export")
    max_delta = 0.0
    for codepoint in left_outlines:
        left_path, right_path = left_outlines[codepoint], right_outlines[codepoint]
        if len(left_path) != len(right_path):
            raise SystemExit(f"Contour command count changed at U+{codepoint:04X}")
        for (left_op, left_args), (right_op, right_args) in zip(left_path, right_path):
            if left_op != right_op:
                raise SystemExit(f"Contour command changed at U+{codepoint:04X}")
            left_values, right_values = list(flatten(left_args)), list(flatten(right_args))
            if len(left_values) != len(right_values):
                raise SystemExit(f"Control-point count changed at U+{codepoint:04X}")
            for left_value, right_value in zip(left_values, right_values):
                max_delta = max(max_delta, abs(left_value - right_value))
    if max_delta > tolerance:
        raise SystemExit(f"Outline rounding exceeded {tolerance} font units: {max_delta}")
    return max_delta


def write_font(font: TTFont, target: Path, flavor: str | None = None) -> bytes:
    target.parent.mkdir(parents=True, exist_ok=True)
    # Keep the source timestamps instead of letting FontTools rewrite head.modified
    # to the current wall clock; otherwise identical rebuilds produce new hashes.
    font.recalcTimestamp = False
    font.flavor = flavor
    font.save(target)
    return target.read_bytes()


def vertical_metrics(font: TTFont) -> dict[str, object]:
    os2, hhea = font["OS/2"], font["hhea"]
    return {
        "units_per_em": font["head"].unitsPerEm,
        "hhea": {"ascender": hhea.ascent, "descender": hhea.descent, "line_gap": hhea.lineGap},
        "typo": {"ascender": os2.sTypoAscender, "descender": os2.sTypoDescender, "line_gap": os2.sTypoLineGap},
        "win": {"ascent": os2.usWinAscent, "descent": os2.usWinDescent},
        "cap_height": getattr(os2, "sCapHeight", None),
        "x_height": getattr(os2, "sxHeight", None),
    }


def positioning_signature(font: TTFont) -> dict[str, object]:
    if "GPOS" not in font:
        return {"present": False, "sha256": None, "features": 0, "lookups": 0}
    table = font["GPOS"].table
    raw = font["GPOS"].compile(font)
    return {
        "present": True,
        "sha256": sha256(raw),
        "features": len(table.FeatureList.FeatureRecord),
        "lookups": len(table.LookupList.Lookup),
    }


def main() -> None:
    source_bytes = SOURCE.read_bytes()
    source_hash = sha256(source_bytes)
    if source_hash != SOURCE_SHA256:
        raise SystemExit(f"Source WOFF2 hash mismatch: {source_hash}")

    original = TTFont(SOURCE)
    if original.flavor != "woff2" or "fvar" not in original:
        raise SystemExit("Expected the extracted variable WOFF2 source")
    axes = {axis.axisTag: (axis.minValue, axis.defaultValue, axis.maxValue) for axis in original["fvar"].axes}
    if axes != {"wdth": (75.0, 100.0, 125.0), "wght": (200.0, 400.0, 900.0)}:
        raise SystemExit(f"Unexpected axes in the extracted source: {axes}")

    web_font = TTFont(SOURCE)
    rebrand(web_font, "Regular")
    web_bytes = write_font(web_font, WEB_OUT, "woff2")

    generated = []
    static_max_deltas = {}
    for weight, subfamily, width in STATIC_INSTANCES:
        variable_instance = TTFont(SOURCE)
        instance = instantiateVariableFont(variable_instance, {"wdth": width, "wght": weight}, inplace=False)
        rebrand(instance, subfamily)
        for output_dir in (APP_DIR, PDF_DIR):
            target = output_dir / f"AyroviExtracted-{subfamily}.ttf"
            data = write_font(instance, target)
            generated.append({"file": str(target.relative_to(ROOT)), "sha256": sha256(data), "weight": weight, "width": width, "subfamily": subfamily})

        # TTF coordinates are integer font units. Verify unchanged contours and
        # advances, allowing at most one unit for rounding the WOFF2 decimals.
        check_font = TTFont(APP_DIR / f"AyroviExtracted-{subfamily}.ttf")
        static_max_deltas[subfamily] = assert_same_geometry(instance, check_font)
        if vertical_metrics(instance) != vertical_metrics(check_font):
            raise SystemExit(f"Vertical font metrics changed after export: {subfamily}")
        source_gpos, output_gpos = positioning_signature(instance), positioning_signature(check_font)
        if source_gpos != output_gpos:
            raise SystemExit(f"GPOS positioning/anchor data changed after export: {subfamily}")
        if "fvar" in check_font or check_font["OS/2"].usWeightClass != weight:
            raise SystemExit(f"Static metadata mismatch: {subfamily}")
        family_names = {record.toUnicode() for record in check_font["name"].names if record.nameID in (1, 16)}
        if family_names != {FAMILY}:
            raise SystemExit(f"Unexpected family name in {subfamily}: {family_names}")
        for record in generated[-2:]:
            record["vertical_metrics"] = vertical_metrics(check_font)
            record["gpos"] = output_gpos

    # Re-encoding to WOFF2 and changing family metadata must preserve variable
    # geometry/advances; WOFF2 coordinates are checked within one font unit.
    renamed_default = TTFont(WEB_OUT)
    for font in (original, renamed_default):
        if "fvar" not in font:
            raise SystemExit("Variable axes were lost from the web font")
    web_max_deltas = {}
    for coordinates in (
        {"wdth": MOBILE_WIDTH, "wght": TYPOGRAPHY["bodyWeight"]},
        {"wdth": MOBILE_WIDTH, "wght": TYPOGRAPHY["headingWeight"]},
        {"wdth": MOBILE_WIDTH, "wght": TYPOGRAPHY["labelWeight"]},
        {"wdth": HEADING_WIDTH, "wght": TYPOGRAPHY["headingWeight"]},
        {"wdth": 112.5, "wght": 650},
        {"wdth": 75, "wght": 200},
        {"wdth": 125, "wght": 900},
    ):
        left = instantiateVariableFont(TTFont(SOURCE), coordinates, inplace=False)
        right = instantiateVariableFont(TTFont(WEB_OUT), coordinates, inplace=False)
        key = f"wdth={coordinates['wdth']},wght={coordinates['wght']}"
        web_max_deltas[key] = assert_same_geometry(left, right)
        if vertical_metrics(left) != vertical_metrics(right):
            raise SystemExit(f"Web vertical metrics changed at {coordinates}")
        if positioning_signature(left) != positioning_signature(right):
            raise SystemExit(f"Web GPOS positioning/anchor data changed at {coordinates}")

    metadata = {
        "family": FAMILY,
        "source": "assets/fonts/source/extracted-site-variable-v1.7.woff2",
        "source_sha256": source_hash,
        "source_original_name_is_not_used_for_family_selection": True,
        "source_axes": {tag: {"min": vals[0], "default": vals[1], "max": vals[2]} for tag, vals in axes.items()},
        "glyph_count": original["maxp"].numGlyphs,
        "unicode_mapping_count": len(original.getBestCmap()),
        "default_vertical_metrics": vertical_metrics(original),
        "web_variable": {"file": str(WEB_OUT.relative_to(ROOT)), "sha256": sha256(web_bytes)},
        "static_instances": generated,
        "max_coordinate_rounding_units": {"static": static_max_deltas, "web_samples": web_max_deltas},
        "validation": "Contour commands, mapped glyphs, advances, vertical metrics and GPOS positioning/anchors match; static coordinate rounding is <=1 font unit (0.1% em at 1000 UPM).",
    }
    output = PDF_DIR / "ayrovi-extracted-fonts.json"
    output.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_path = PDF_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    replaced = {"assets/fonts/source/extracted-site-variable-v1.7.woff2"}
    replaced.update(record["file"] for record in generated if record["file"].startswith("assets/fonts/AyroviExtracted-"))
    preserved = [record for record in manifest if record.get("file") not in replaced]
    derived_manifest = [{
        "file": "assets/fonts/source/extracted-site-variable-v1.7.woff2",
        "source": "verified variable font resource observed on the public site",
        "version": "1.700 source",
        "sha256": source_hash,
    }]
    for record in generated:
        if not record["file"].startswith("assets/fonts/AyroviExtracted-"):
            continue
        derived_manifest.append({
            "file": record["file"],
            "source": f"scripts/build-ayrovi-extracted-fonts.py; wdth={record['width']}, wght={record['weight']}",
            "version": "1.700 derived",
            "sha256": record["sha256"],
        })
    manifest_path.write_text(json.dumps(derived_manifest + preserved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
