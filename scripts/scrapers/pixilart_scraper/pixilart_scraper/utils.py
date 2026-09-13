"""
utils.py — Shared utilities for the Pixilart scraper.

Covers:
- URL normalization
- Tag cleaning
- Sequential ID / filename generation
- Image metric calculation (via Pillow)
- Report generation
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse

# ---------------------------------------------------------------------------
# Thread-safe sequential ID counter
# ---------------------------------------------------------------------------

_counter_lock = threading.Lock()
_counter: int = 0


def next_id() -> int:
    """Return the next sequential ID (thread-safe)."""
    global _counter
    with _counter_lock:
        _counter += 1
        return _counter


def set_counter_start(n: int) -> None:
    """Seed the counter to avoid collisions when resuming a crawl."""
    global _counter
    with _counter_lock:
        _counter = n


def filename_for_id(item_id: int, ext: str = ".png") -> str:
    """
    Generate a clean, zero-padded filename.
    Example: filename_for_id(42) -> 'pixilart_000042.png'
    """
    ext = ext.lstrip(".")
    return f"pixilart_{item_id:06d}.{ext}"


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def normalize_url(url: str) -> str:
    """Strip query strings and fragments, normalize scheme."""
    parsed = urlparse(url.strip())
    # Keep only scheme, netloc, path
    clean = urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))
    return clean


def art_slug(url: str) -> str:
    """
    Extract the art slug from a Pixilart art URL.
    e.g. 'https://www.pixilart.com/art/cool-dragon-abc123' -> 'cool-dragon-abc123'
    """
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] if path else ""


def is_art_url(url: str) -> bool:
    """Return True if the URL looks like a Pixilart individual art page."""
    parsed = urlparse(url)
    return (
        "pixilart.com" in parsed.netloc
        and parsed.path.startswith("/art/")
        and len(parsed.path.split("/")) >= 3
    )


# ---------------------------------------------------------------------------
# Tag helpers
# ---------------------------------------------------------------------------

_REVIEW_TAGS = frozenset({"base", "collab", "collaboration", "wip", "template", "free2use"})
_REJECT_TAGS = frozenset({"notmine", "stolen", "repost", "traced"})


def clean_tags(raw_tags: list[str]) -> list[str]:
    """Lowercase, strip whitespace, remove empty strings."""
    return [t.strip().lower() for t in raw_tags if t.strip()]


def tags_trigger_reject(tags: list[str]) -> Optional[str]:
    """
    Return a reject reason string if any tag is in the hard-reject list,
    or None if the tags are fine.
    """
    lowered = {t.lower() for t in tags}
    matched = lowered & _REJECT_TAGS
    if matched:
        return f"rejected_tag:{','.join(sorted(matched))}"
    return None


def tags_trigger_review(tags: list[str]) -> Optional[str]:
    """
    Return a review reason string if any tag warrants manual review,
    or None.
    """
    lowered = {t.lower() for t in tags}
    matched = lowered & _REVIEW_TAGS
    if matched:
        return f"review_tag:{','.join(sorted(matched))}"
    return None


# ---------------------------------------------------------------------------
# Image metrics
# ---------------------------------------------------------------------------

def compute_image_metrics(path: Path) -> dict:
    """
    Open an image file with Pillow and compute all required metrics.
    Returns a dict with: width_px, height_px, size_label, pixel_count,
    aspect_ratio, is_square, file_size_bytes, is_gif.

    Raises ValueError if the file cannot be opened as an image.
    """
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(path) as img:
            width, height = img.size
            fmt = (img.format or "").upper()
            is_gif = fmt == "GIF"
    except (UnidentifiedImageError, Exception) as exc:
        raise ValueError(f"Cannot read image '{path}': {exc}") from exc

    file_size = path.stat().st_size
    pixel_count = width * height
    aspect_ratio = round(width / height, 4) if height else 0.0
    is_square = width == height

    return {
        "width_px":       width,
        "height_px":      height,
        "size_label":     f"{width}x{height}",
        "pixel_count":    pixel_count,
        "aspect_ratio":   aspect_ratio,
        "is_square":      is_square,
        "file_size_bytes": file_size,
        "is_gif":         is_gif,
    }


def guess_extension_from_url(url: str) -> str:
    """
    Return a file extension derived from the URL path.
    Falls back to '.png' if nothing recognizable is found.
    """
    path = urlparse(url).path.lower()
    for ext in (".gif", ".webp", ".jpg", ".jpeg", ".png"):
        if path.endswith(ext):
            return ext
    return ".png"


# ---------------------------------------------------------------------------
# Timestamp
# ---------------------------------------------------------------------------

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# JSONL helpers
# ---------------------------------------------------------------------------

def append_jsonl(path: Path, record: dict) -> None:
    """Append a single JSON record as a new line to a JSONL file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    """Read all records from a JSONL file."""
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return records


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def generate_report(raw_jsonl: Path, filtered_jsonl: Path, rejected_jsonl: Path, reports_dir: Path) -> None:
    """
    Build a summary report from the JSONL manifests and save it to reports_dir.
    """
    from collections import Counter

    raw      = read_jsonl(raw_jsonl)
    accepted = read_jsonl(filtered_jsonl)
    rejected = read_jsonl(rejected_jsonl)

    size_dist: Counter = Counter()
    for rec in accepted:
        label = rec.get("size_label", "unknown")
        size_dist[label] += 1

    reject_reasons: Counter = Counter()
    for rec in rejected:
        reason = rec.get("reject_reason") or "unknown"
        reject_reasons[reason] += 1

    top_sizes = [{"size_label": k, "count": v} for k, v in size_dist.most_common(20)]
    top_rejections = [{"reason": k, "count": v} for k, v in reject_reasons.most_common(10)]

    report = {
        "generated_at":       utc_now_iso(),
        "total_downloaded":   len(raw),
        "total_accepted":     len(accepted),
        "total_rejected":     len(rejected),
        "size_distribution":  top_sizes,
        "top_reject_reasons": top_rejections,
    }

    reports_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = reports_dir / f"report_{ts}.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # Also overwrite latest.json for easy access
    (reports_dir / "latest.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return out
