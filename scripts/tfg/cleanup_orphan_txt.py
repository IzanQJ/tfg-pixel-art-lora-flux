"""
Remove orphan .txt caption files that do not have a matching .png image.

Usage:
  python scripts/cleanup_orphan_txt.py --images datasets/iter_01/images
"""

from __future__ import annotations

import argparse
from pathlib import Path


def cleanup(images_dir: Path, dry_run: bool) -> int:
    png_stems = {p.stem for p in images_dir.glob("*.png")}
    txt_files = sorted(images_dir.glob("*.txt"), key=lambda p: p.name.lower())

    to_delete = [t for t in txt_files if t.stem not in png_stems]

    print("=== cleanup_orphan_txt report ===")
    print(f"Images folder: {images_dir}")
    print(f"Orphan txt found: {len(to_delete)}")

    for path in to_delete:
        print(f"  - {path.name}")
        if not dry_run:
            path.unlink(missing_ok=True)

    if dry_run:
        print("Dry-run enabled: no files were deleted.")
    else:
        print(f"Deleted: {len(to_delete)}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete .txt files without matching .png")
    parser.add_argument("--images", required=True, help="Path to images folder")
    parser.add_argument("--dry-run", action="store_true", help="Only report what would be deleted")
    args = parser.parse_args()

    images_dir = Path(args.images)
    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")

    return cleanup(images_dir, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
