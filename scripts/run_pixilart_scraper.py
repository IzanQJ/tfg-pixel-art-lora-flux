#!/usr/bin/env python3
"""
run_pixilart_scraper.py — Top-level entry point for the Pixilart scraper.

Designed to be run from the repo root (or from anywhere):

    python scripts/run_pixilart_scraper.py --max-items 200 --tags PIXELART 16x16 32x32
    python scripts/run_pixilart_scraper.py --max-items 1000 --tags PIXELART --overwrite

This wrapper:
  1. Resolves all paths relative to this file (repo-root-relative).
  2. Adds the Scrapy project directory to sys.path.
  3. Delegates to the Scrapy CrawlerProcess, writing logs to
     datasets/pixilart/raw/logs/.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup — works regardless of cwd
# ---------------------------------------------------------------------------
HERE      = Path(__file__).resolve().parent   # scripts/
REPO_ROOT = HERE.parent                       # ai-toolkit/
SCRAPY_PROJECT = REPO_ROOT / "scripts" / "scrapers" / "pixilart_scraper"
LOG_DIR        = REPO_ROOT / "datasets" / "pixilart" / "raw" / "logs"

if str(SCRAPY_PROJECT) not in sys.path:
    sys.path.insert(0, str(SCRAPY_PROJECT))

# Point Scrapy at the right settings module
os.environ.setdefault("SCRAPY_SETTINGS_MODULE", "pixilart_scraper.settings")


def _setup_log_file() -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return LOG_DIR / f"spider_{ts}.log"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape pixel art from Pixilart.com and store in datasets/pixilart/."
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=0,
        metavar="N",
        help="Stop after collecting N items (default: 0 = unlimited).",
    )
    parser.add_argument(
        "--tags",
        nargs="+",
        default=["PIXELART"],
        metavar="TAG",
        help="One or more Pixilart tags to seed (default: PIXELART).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        default=False,
        help="Re-scrape art pages already present in the raw manifest.",
    )
    args = parser.parse_args()

    # Late import — after sys.path is set
    from scrapy.crawler import CrawlerProcess
    from scrapy.utils.project import get_project_settings

    settings = get_project_settings()
    log_file = _setup_log_file()
    settings.set("LOG_FILE",  str(log_file), priority="cmdline")
    settings.set("LOG_LEVEL", "INFO",        priority="cmdline")

    tags_str = ",".join(args.tags)

    print("=" * 60)
    print("  Pixilart Scraper")
    print("=" * 60)
    print(f"  Repo root  : {REPO_ROOT}")
    print(f"  Tags       : {tags_str}")
    print(f"  Max items  : {args.max_items or 'unlimited'}")
    print(f"  Overwrite  : {args.overwrite}")
    print(f"  Log file   : {log_file}")
    print("=" * 60)

    process = CrawlerProcess(settings)
    process.crawl(
        "pixilart",
        tags=tags_str,
        max_items=str(args.max_items),
        overwrite=str(args.overwrite).lower(),
    )
    process.start()

    print("\nScraping complete. Check datasets/pixilart/ for results.")
    print(f"Report: {REPO_ROOT / 'datasets' / 'pixilart' / 'reports' / 'latest.json'}")


if __name__ == "__main__":
    main()
