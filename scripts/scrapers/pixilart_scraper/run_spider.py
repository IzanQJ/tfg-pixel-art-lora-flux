#!/usr/bin/env python3
"""
run_spider.py — Local runner for the Pixilart Scrapy spider.

Run from within the pixilart_scraper/ project directory:

    python run_spider.py --topics cats cars food --max-items 200
    python run_spider.py --topics fantasy --overwrite
    python run_spider.py --topics cats cars --max-items 500

    # Legacy tag-based (still supported)
    python run_spider.py --tags PIXELART --max-items 200

The script sets up logging, then calls the Scrapy CrawlerProcess directly
so you don't need to use the scrapy CLI.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make sure the Scrapy project is importable
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings


def _setup_logging(log_dir: Path) -> tuple[Path, logging.Handler]:
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"spider_{ts}.log"

    fmt = logging.Formatter(
        "%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    ch = logging.StreamHandler(sys.stderr)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    return log_file, ch


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the Pixilart Scrapy spider locally."
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=0,
        help="Global stop after collecting this many items total (0 = unlimited).",
    )
    parser.add_argument(
        "--items-per-topic",
        type=int,
        default=20,
        help="Max items to collect per topic (default: 20).",
    )
    parser.add_argument(
        "--topics",
        nargs="+",
        default=[],
        help="One or more Pixilart topics to scrape (space-separated), e.g. cats cars food.",
    )
    parser.add_argument(
        "--tags",
        nargs="+",
        default=[],
        help="(Legacy) One or more Pixilart tag slugs to scrape (space-separated).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        default=False,
        help="Re-scrape art pages already present in the raw manifest.",
    )
    parser.add_argument(
        "--min-likes",
        type=int,
        default=0,
        help="Skip art items with fewer than this many likes (0 = no filter).",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        default=False,
        help="Disable HTTP cache so all requests are fetched fresh from the server.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
        help="Dataset root for this scrape. Defaults to datasets/pixilart.",
    )
    args = parser.parse_args()

    if not args.topics and not args.tags:
        parser.error("Specify at least one --topics or --tags argument.")

    # Build settings overrides
    settings = get_project_settings()

    if args.output_root:
        output_root = args.output_root.resolve()
        settings.set("RAW_IMAGES_DIR", str(output_root / "raw" / "images"), priority="cmdline")
        settings.set("RAW_METADATA_DIR", str(output_root / "raw" / "metadata"), priority="cmdline")
        settings.set("RAW_LOGS_DIR", str(output_root / "raw" / "logs"), priority="cmdline")
        settings.set("ACCEPTED_DIR", str(output_root / "filtered" / "accepted"), priority="cmdline")
        settings.set("REJECTED_DIR", str(output_root / "filtered" / "rejected"), priority="cmdline")
        settings.set("FILTERED_META_DIR", str(output_root / "filtered" / "metadata"), priority="cmdline")
        settings.set("REPORTS_DIR", str(output_root / "reports"), priority="cmdline")
        settings.set("HTTPCACHE_DIR", str(output_root / "raw" / "logs" / "httpcache"), priority="cmdline")

    # Resolve log path from settings
    log_dir = Path(settings.get("RAW_LOGS_DIR", "logs"))
    log_file, console_handler = _setup_logging(log_dir)
    # Scrapy writes to the log file; we add a StreamHandler after CrawlerProcess
    # configures its logging so the terminal also shows output (no duplication).
    settings.set("LOG_FILE", str(log_file), priority="cmdline")
    settings.set("LOG_LEVEL", "INFO", priority="cmdline")

    tags_str = ",".join(args.tags)
    topics_str = ",".join(args.topics)

    print(f"[run_spider] Topics         : {topics_str or '(none)'}")
    print(f"[run_spider] Tags           : {tags_str or '(none)'}")
    print(f"[run_spider] Items/topic    : {args.items_per_topic}")
    print(f"[run_spider] Max items      : {args.max_items or 'unlimited'}")
    print(f"[run_spider] Min likes      : {args.min_likes or 'none'}")
    print(f"[run_spider] Overwrite      : {args.overwrite}")
    print(f"[run_spider] No cache       : {args.no_cache}")
    if args.output_root:
        print(f"[run_spider] Output root    : {args.output_root.resolve()}")
    print(f"[run_spider] Log file       : {log_file}")

    if args.no_cache:
        settings.set("HTTPCACHE_ENABLED", False, priority="cmdline")

    process = CrawlerProcess(settings)
    # After CrawlerProcess configures Scrapy's logging (file-only), add our
    # console handler so output is visible in the terminal too.
    logging.getLogger().addHandler(console_handler)
    process.crawl(
        "pixilart",
        topics=topics_str,
        tags=tags_str,
        items_per_topic=str(args.items_per_topic),
        max_items=str(args.max_items),
        overwrite=str(args.overwrite).lower(),
        min_likes=str(args.min_likes),
    )
    process.start()


if __name__ == "__main__":
    main()
