"""
Sync captions from a single CSV master file into per-image .txt files.

Usage examples:
  python scripts/sync_captions.py --images datasets/iter_01/images
  python scripts/sync_captions.py --images datasets/iter_01/images --create-template
  python scripts/sync_captions.py --images datasets/iter_01/images --create-template --from-txt
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

TRIGGER = "pixelart"


def normalize_caption(text: str) -> str:
    caption = (text or "").strip()
    if not caption:
        return ""

    lower = caption.lower()
    if lower.startswith("pixelart,"):
        return caption
    if lower.startswith("pixelart"):
        rest = caption[len("pixelart") :].lstrip(" ,")
        return f"{TRIGGER}, {rest}" if rest else f"{TRIGGER},"
    return f"{TRIGGER}, {caption}"


def create_template(images_dir: Path, csv_path: Path, from_txt: bool) -> None:
    png_files = sorted(images_dir.glob("*.png"), key=lambda p: p.name.lower())
    rows = []

    for img in png_files:
        caption = ""
        if from_txt:
            txt_path = img.with_suffix(".txt")
            if txt_path.exists():
                caption = txt_path.read_text(encoding="utf-8").strip()
        rows.append({"file": img.name, "caption": caption})

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "caption"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Template created: {csv_path}")
    print(f"Rows written: {len(rows)}")
    print("Note: edit captions in CSV, then run sync without --create-template.")


def load_csv(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        expected = {"file", "caption"}
        found = {h.strip() for h in (reader.fieldnames or [])}
        if not expected.issubset(found):
            raise ValueError("captions.csv must contain columns: file,caption")
        return [{"file": (r.get("file") or "").strip(), "caption": (r.get("caption") or "")} for r in reader]


def sync(images_dir: Path, csv_path: Path) -> int:
    rows = load_csv(csv_path)

    png_names = {p.name for p in images_dir.glob("*.png")}
    updated = 0
    missing_captions = []
    csv_file_missing_on_disk = []

    for row in rows:
        file_name = row["file"]
        raw_caption = row["caption"]

        if not file_name:
            continue

        if file_name not in png_names:
            csv_file_missing_on_disk.append(file_name)
            continue

        norm = normalize_caption(raw_caption)
        if not norm:
            missing_captions.append(file_name)
            continue

        txt_path = images_dir / Path(file_name).with_suffix(".txt").name
        old = txt_path.read_text(encoding="utf-8").strip() if txt_path.exists() else None
        if old != norm:
            txt_path.write_text(norm, encoding="utf-8")
            updated += 1

    png_without_csv = sorted(png_names - {r["file"] for r in rows if r["file"]})

    print("=== sync_captions report ===")
    print(f"Images folder: {images_dir}")
    print(f"CSV file:      {csv_path}")
    print(f"TXT created/updated: {updated}")
    print(f"Missing captions in CSV rows: {len(missing_captions)}")
    if missing_captions:
        for item in missing_captions:
            print(f"  - {item}")

    print(f"Images without CSV row: {len(png_without_csv)}")
    if png_without_csv:
        for item in png_without_csv:
            print(f"  - {item}")

    print(f"CSV rows pointing to missing image files: {len(csv_file_missing_on_disk)}")
    if csv_file_missing_on_disk:
        for item in csv_file_missing_on_disk:
            print(f"  - {item}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync per-image .txt captions from captions.csv")
    parser.add_argument("--images", required=True, help="Path to iteration images folder, e.g. datasets/iter_01/images")
    parser.add_argument("--csv", default=None, help="Path to captions.csv. Default: parent(images)/captions.csv")
    parser.add_argument("--create-template", action="store_true", help="Create captions.csv template from image filenames")
    parser.add_argument("--from-txt", action="store_true", help="When creating template, initialize caption from existing .txt")

    args = parser.parse_args()
    images_dir = Path(args.images)
    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")

    csv_path = Path(args.csv) if args.csv else images_dir.parent / "captions.csv"

    if args.create_template:
        create_template(images_dir, csv_path, from_txt=args.from_txt)
        return 0

    if not csv_path.exists():
        raise FileNotFoundError(
            f"CSV file not found: {csv_path}. Run with --create-template first."
        )

    return sync(images_dir, csv_path)


if __name__ == "__main__":
    raise SystemExit(main())
