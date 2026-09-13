"""
pipelines.py — Item processing pipeline for the Pixilart scraper.

Pipeline order (defined in settings.py):
  100 → ImageDownloadPipeline  : download image, compute Pillow metrics
  200 → FilterPipeline         : decide accepted / rejected / review
  300 → OrganizePipeline       : copy file to accepted/ or rejected/ folder
  400 → ManifestPipeline       : append record to JSONL manifests
"""

from __future__ import annotations

import logging
import shutil
import urllib.request
from pathlib import Path
from typing import Union

from itemadapter import ItemAdapter
from scrapy.exceptions import DropItem

from pixilart_scraper.utils import (
    append_jsonl,
    compute_image_metrics,
    filename_for_id,
    generate_report,
    guess_extension_from_url,
    tags_trigger_reject,
    tags_trigger_review,
    utc_now_iso,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1 — Download & metrics
# ---------------------------------------------------------------------------

class ImageDownloadPipeline:
    """Download the raw image and fill all size/metric fields via Pillow."""

    def open_spider(self, spider):
        self.raw_images_dir = Path(spider.settings["RAW_IMAGES_DIR"])
        self.raw_images_dir.mkdir(parents=True, exist_ok=True)

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)

        image_url = adapter.get("image_url")
        if not image_url:
            raise DropItem(f"No image_url for art_url={adapter.get('art_url')}")

        item_id = adapter.get("id")
        ext = guess_extension_from_url(image_url)
        filename = filename_for_id(item_id, ext)
        dest = self.raw_images_dir / filename

        # --- download ---
        if not dest.exists():
            try:
                req = urllib.request.Request(
                    image_url,
                    headers={
                        "User-Agent": spider.settings.get(
                            "USER_AGENT",
                            "PixilartResearchScraper/1.0",
                        )
                    },
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                dest.write_bytes(data)
            except Exception as exc:
                raise DropItem(f"Failed to download {image_url}: {exc}") from exc
        else:
            logger.debug("Raw file already exists, skipping download: %s", dest)

        adapter["local_raw_path"] = str(dest)

        # --- Pillow metrics (download / exported PNG — NOT the canvas size) ---
        try:
            metrics = compute_image_metrics(dest)
        except ValueError as exc:
            # Corrupt / unreadable — mark so FilterPipeline can reject
            logger.warning("Cannot read image metrics for %s: %s", dest, exc)
            adapter["filter_status"] = "rejected"
            adapter["reject_reason"] = "corrupt_image"
            adapter["width_px"]     = None
            adapter["height_px"]    = None
            adapter["size_label"]   = None
            adapter["pixel_count"]  = None
            adapter["aspect_ratio"] = None
            adapter["is_square"]    = None
            adapter["file_size_bytes"] = dest.stat().st_size if dest.exists() else 0
            adapter["is_gif"]       = None
            # canvas_* fields already set by spider — do NOT touch them
            return item

        # Write to download / Pillow fields.  NEVER overwrite canvas_* fields.
        adapter["width_px"]        = metrics["width_px"]
        adapter["height_px"]       = metrics["height_px"]
        adapter["size_label"]      = metrics["size_label"]
        adapter["pixel_count"]     = metrics["pixel_count"]
        adapter["aspect_ratio"]    = metrics["aspect_ratio"]
        adapter["is_square"]       = metrics["is_square"]
        adapter["file_size_bytes"] = metrics["file_size_bytes"]
        adapter["is_gif"]          = metrics["is_gif"]
        # canvas_* fields already set by spider — do NOT touch them

        return item


# ---------------------------------------------------------------------------
# 2 — Filtering
# ---------------------------------------------------------------------------

class FilterPipeline:
    """
    Apply business rules to decide the fate of each item.

    Rules (applied in order):
      1. Already marked by upstream pipeline → skip re-evaluation
      2. GIF → reject
      3. Corrupt (reject_reason already set) → reject
      4. Width or height > MAX_DIMENSION (128 px) → reject
      5. Tags in hard-reject list (NOTMINE, traced…) → reject
      6. Tags in review list (base, collab…) → review / pending_review
      7. Otherwise → accepted
    """

    MAX_DIMENSION = 128  # pixels — images larger than this are rejected

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)

        # Already decided upstream (e.g. canvas_too_large pre-rejected by spider,
        # or corrupt image from ImageDownloadPipeline)
        if adapter.get("filter_status") in ("rejected", "review"):
            if not adapter.get("review_status"):
                adapter["review_status"] = "auto"
            return item

        # Canvas size safety net — spider already skips these before yielding,
        # but drop here too so they never reach OrganizePipeline / manifests.
        canvas_w = adapter.get("canvas_width_px") or 0
        canvas_h = adapter.get("canvas_height_px") or 0
        if canvas_w > 128 or canvas_h > 128:
            raise DropItem(
                f"canvas_too_large ({canvas_w}x{canvas_h}) — "
                f"dropped silently, not in rejected"
            )

        tags = adapter.get("tags") or []

        # GIF rejection
        if adapter.get("is_gif"):
            adapter["filter_status"] = "rejected"
            adapter["review_status"] = "auto"
            adapter["reject_reason"] = "is_gif"
            return item

        # Hard-reject tags
        reason = tags_trigger_reject(tags)
        if reason:
            adapter["filter_status"] = "rejected"
            adapter["review_status"] = "auto"
            adapter["reject_reason"] = reason
            return item

        # Review tags
        review_reason = tags_trigger_review(tags)
        if review_reason:
            adapter["filter_status"] = "review"
            adapter["review_status"] = "pending_review"
            adapter["reject_reason"] = review_reason
            return item

        # Accept
        adapter["filter_status"] = "accepted"
        adapter["review_status"] = "auto"
        adapter["reject_reason"] = None

        return item


# ---------------------------------------------------------------------------
# 3 — Organize files
# ---------------------------------------------------------------------------

class OrganizePipeline:
    """
    Copy accepted images to filtered/accepted/ and rejected ones to
    filtered/rejected/. The original raw file is preserved intact.
    """

    def open_spider(self, spider):
        self.accepted_dir = Path(spider.settings["ACCEPTED_DIR"])
        self.rejected_dir = Path(spider.settings["REJECTED_DIR"])
        self.accepted_dir.mkdir(parents=True, exist_ok=True)
        self.rejected_dir.mkdir(parents=True, exist_ok=True)

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        status = adapter.get("filter_status")
        raw_path = adapter.get("local_raw_path")

        if not raw_path:
            return item

        src = Path(raw_path)
        if not src.exists():
            logger.warning("Raw file missing, cannot organize: %s", src)
            return item

        if status == "accepted":
            dest_dir = self.accepted_dir
        elif status == "rejected":
            dest_dir = self.rejected_dir
        else:
            # "review" items go to accepted folder pending human decision
            dest_dir = self.accepted_dir

        dest = dest_dir / src.name
        if not dest.exists():
            shutil.copy2(src, dest)

        adapter["local_filtered_path"] = str(dest)
        return item


# ---------------------------------------------------------------------------
# 4 — Write manifests
# ---------------------------------------------------------------------------

class ManifestPipeline:
    """
    Append each processed item to the appropriate JSONL manifest.
    Also maintains a raw manifest (all items regardless of status).
    On spider close, triggers report generation.
    """

    def open_spider(self, spider):
        raw_meta = Path(spider.settings["RAW_METADATA_DIR"])
        filtered_meta = Path(spider.settings["FILTERED_META_DIR"])
        raw_meta.mkdir(parents=True, exist_ok=True)
        filtered_meta.mkdir(parents=True, exist_ok=True)

        self.raw_jsonl      = raw_meta      / "pixilart_raw.jsonl"
        self.accepted_jsonl = filtered_meta / "pixilart_filtered.jsonl"
        self.rejected_jsonl = filtered_meta / "pixilart_rejected.jsonl"
        self.reports_dir    = Path(spider.settings["REPORTS_DIR"])

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        record = dict(adapter)

        # Raw manifest — every item
        append_jsonl(self.raw_jsonl, record)

        # Filtered manifests
        status = record.get("filter_status")
        if status == "accepted":
            append_jsonl(self.accepted_jsonl, record)
        elif status == "rejected":
            append_jsonl(self.rejected_jsonl, record)
        elif status == "review":
            # Include in accepted manifest too (flagged for human review)
            append_jsonl(self.accepted_jsonl, record)

        return item

    def close_spider(self, spider):
        try:
            out = generate_report(
                self.raw_jsonl,
                self.accepted_jsonl,
                self.rejected_jsonl,
                self.reports_dir,
            )
            logger.info("Report saved: %s", out)
        except Exception as exc:
            logger.error("Failed to generate report: %s", exc)
