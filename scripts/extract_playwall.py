"""Extract designated Playwall document panels from the supplied Triangle Agency PDF."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import fitz
from PIL import Image


CODE_PATTERN = re.compile(r"^[A-Z]\d{1,3}$")
PALETTES = {
    "Agency (Red)": (201, 32, 47),
    "Anomaly (Blue)": (45, 81, 161),
    "Reality (Yellow)": (238, 175, 32),
}
FIRST_PDF_INDEX = 203
LAST_PDF_INDEX = 296
CONTENT_RIGHT = 557.0
CONTENT_BOTTOM = 784.0
RENDER_SCALE = 2.0
TITLE_OVERRIDES = {
    "A1": "Mission Report",
    "A2": "Ripple Gun Ultima",
    "F1": "Fade Away",
    "K1": "The Abnormal Briefcase",
    "K2": "Anomaly Abilities",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/assets/Playwall"))
    return parser.parse_args()


def find_pdf(explicit: Path | None) -> Path:
    if explicit:
        return explicit
    matches = sorted(Path("data/pdf").glob("*.pdf"))
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one PDF in data/pdf; use --pdf to choose one.")
    return matches[0]


def designation_tabs(page: fitz.Page) -> list[dict]:
    tabs = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            colors = {span["color"] for span in line["spans"]}
            box = fitz.Rect(line["bbox"])
            if CODE_PATTERN.fullmatch(text) and 0xFFFFFF in colors and box.width > 20:
                tabs.append({"code": text, "box": box})
    return sorted(tabs, key=lambda tab: tab["box"].y0)


def classify_tab(page: fitz.Page, tab: dict) -> str:
    pixmap = page.get_pixmap(alpha=False)
    box = tab["box"]
    center_y = (box.y0 + box.y1) / 2
    xs = (4, 8, 48, 52) if box.x0 < 100 else (503, 507, 548, 552)
    ys = (center_y - 12, center_y - 7, center_y + 7, center_y + 12)
    best = (math.inf, "")
    for x in xs:
        for y in ys:
            if not (0 <= x < pixmap.width and 0 <= y < pixmap.height):
                continue
            pixel = pixmap.pixel(int(x), int(y))
            for category, target in PALETTES.items():
                distance = sum((pixel[channel] - target[channel]) ** 2 for channel in range(3))
                if distance < best[0]:
                    best = (distance, category)
    return best[1]


def clean_text(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\u00ad", "").splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and (not lines[-1].strip() or re.fullmatch(r"\d{3}", lines[-1].strip())):
        lines.pop()
    return "\n".join(lines).strip()


def title_for(code: str, text: str) -> str:
    if code in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[code]
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if code not in lines:
        return f"Playwall Document {code}"
    index = lines.index(code)
    if index == 0 and len(lines) > 1:
        return lines[1]
    if index > 0:
        return " ".join(lines[:index])
    return f"Playwall Document {code}"


def render_panel(page: fitz.Page, clip: fitz.Rect) -> Image.Image:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE), clip=clip, alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def join_panels(panels: list[Image.Image]) -> Image.Image:
    if len(panels) == 1:
        return panels[0]
    width = max(panel.width for panel in panels)
    height = sum(panel.height for panel in panels)
    joined = Image.new("RGB", (width, height), "white")
    offset = 0
    for panel in panels:
        joined.paste(panel, (0, offset))
        offset += panel.height
    return joined


def extract(pdf_path: Path, output: Path) -> list[dict]:
    document = fitz.open(pdf_path)
    if document.page_count <= LAST_PDF_INDEX:
        raise RuntimeError(f"PDF has only {document.page_count} pages; expected the Playwall through page 297.")

    parts = defaultdict(list)
    for page_index in range(FIRST_PDF_INDEX, LAST_PDF_INDEX + 1):
        page = document[page_index]
        tabs = designation_tabs(page)
        for index, tab in enumerate(tabs):
            top = max(0, tab["box"].y0 - 4)
            bottom = tabs[index + 1]["box"].y0 - 1 if index + 1 < len(tabs) else CONTENT_BOTTOM
            clip = fitz.Rect(0, top, CONTENT_RIGHT, min(bottom, page.rect.height))
            category = classify_tab(page, tab)
            text = clean_text(page.get_text("text", clip=clip))
            parts[(category, tab["code"])].append(
                {
                    "image": render_panel(page, clip),
                    "text": text,
                    "pdfPage": page_index + 1,
                }
            )

    manifest = []
    for (category, code), document_parts in sorted(parts.items()):
        category_root = output / category
        image_directory = category_root / "images"
        image_directory.mkdir(parents=True, exist_ok=True)

        image_path = image_directory / f"{code}.png"
        joined = join_panels([part["image"] for part in document_parts])
        joined.save(image_path, optimize=True)

        title = title_for(code, document_parts[0]["text"])
        manifest.append(
            {
                "designation": code,
                "category": category,
                "title": title,
                "image": image_path.as_posix(),
                "sourcePdfPages": [part["pdfPage"] for part in document_parts],
            }
        )

    manifest.sort(key=lambda item: (item["category"], item["designation"]))
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    args = arguments()
    manifest = extract(find_pdf(args.pdf), args.output)
    counts = {category: 0 for category in PALETTES}
    for item in manifest:
        counts[item["category"]] += 1
    print(f"Extracted {len(manifest)} Playwall documents")
    for category, count in counts.items():
        print(f"  {category}: {count}")


if __name__ == "__main__":
    main()
