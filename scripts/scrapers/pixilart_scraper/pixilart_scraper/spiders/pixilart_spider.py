"""
pixilart_spider.py — Main Scrapy spider for pixilart.com

Usage (via Scrapy CLI):
    scrapy crawl pixilart -a topics=cats,cars,food
    scrapy crawl pixilart -a topics=cats,cars -a max_items=200
    scrapy crawl pixilart -a topics=fantasy -a overwrite=true

    # Legacy tag-based (still supported)
    scrapy crawl pixilart -a tags=PIXELART,16x16

Usage (via run_spider.py wrapper):
    python run_spider.py --topics cats cars food --max-items 200
    python run_spider.py --topics fantasy --overwrite

Spider arguments (passed with -a):
    topics          : comma-separated Pixilart topics to crawl, e.g. cats,cars,food
    tags            : (legacy) comma-separated tag slugs; kept for backward compat
    items_per_topic : max items to collect per topic (default: 20)
    max_items       : global stop after this many total items (default: 0 = unlimited)
    overwrite       : if "true", re-scrape art pages already in the raw manifest

Flow (topic mode):
    1. For each topic call GET /api/w/gallery/{page_id}/{last_id}/topics?sub={topic}
    2. Parse JSON response, build PixilartItem per art entry
    3. Paginate using page_id / last_id until the API returns an empty art list
    4. Every item passes through the 4-stage pipeline unchanged
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Iterator, Optional
from urllib.parse import urljoin, urlparse, urlencode

import scrapy
from scrapy.http import Request, Response

from pixilart_scraper.items import PixilartItem
from pixilart_scraper.utils import (
    art_slug,
    clean_tags,
    is_art_url,
    next_id,
    normalize_url,
    read_jsonl,
    set_counter_start,
    utc_now_iso,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE = "https://www.pixilart.com"

# Real API endpoint discovered via Playwright network capture
# Pattern: GET /api/w/gallery/{page_id}/{last_id}/tags?user=true&liked=true&comments=true&sub={tag}&sub_sec=new
TAG_API_TPL = (
    BASE + "/api/w/gallery/{page_id}/{last_id}/tags"
    "?user=true&liked=true&comments=true&sub={tag}&sub_sec=new"
)
# HTML gallery page (used as Referer header only)
TAG_PAGE_TPL = BASE + "/gallery/tags/{tag}"

# Topic API — Pixilart topics use the same /tags endpoint, with the topic
# slug as the ?sub= parameter. There is no separate /topics API path.
TOPIC_API_TPL = (
    BASE + "/api/w/gallery/{page_id}/{last_id}/tags"
    "?user=true&liked=true&comments=true&sub={topic}&sub_sec=new"
)
# HTML topic gallery page (used as Referer header only)
TOPIC_PAGE_TPL = BASE + "/gallery/topics/{topic}"

# Regexes
_ART_PATH_RE = re.compile(r"^/art/[a-zA-Z0-9_-]+$")


class PixilartSpider(scrapy.Spider):
    name = "pixilart"
    allowed_domains = ["pixilart.com", "www.pixilart.com", "cdn.pixilart.com"]

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def __init__(
        self,
        topics: str = "",
        tags: str = "",
        items_per_topic: str = "20",
        max_items: str = "0",
        overwrite: str = "false",
        min_likes: str = "0",
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.seed_topics: list[str] = [t.strip() for t in topics.split(",") if t.strip()]
        self.seed_tags: list[str] = [t.strip() for t in tags.split(",") if t.strip()]  # legacy
        self.items_per_topic: int = int(items_per_topic)
        self.max_items: int = int(max_items)
        self.overwrite: bool = overwrite.lower() in ("true", "1", "yes")
        self.min_likes: int = int(min_likes)
        self._item_count: int = 0
        self._topic_counts: dict[str, int] = {}  # per-topic accepted count
        self._seen_art_urls: set[str] = set()  # deduplicate within a session

    # ------------------------------------------------------------------
    # Spider lifecycle
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[Request]:
        """Seed the crawl by calling the Pixilart JSON gallery API directly."""
        self._load_existing_urls()

        if not self.seed_topics and not self.seed_tags:
            logger.error(
                "No topics or tags specified. "
                "Use -a topics=cats,cars or -a tags=PIXELART. Aborting."
            )
            return

        # --- Topic mode (primary) ---
        for topic in self.seed_topics:
            url = TOPIC_API_TPL.format(page_id=1, last_id=0, topic=topic.lower())
            yield Request(
                url=url,
                callback=self.parse_topic_api,
                meta={"topic": topic, "page_id": 1, "last_id": 0},
                headers={
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": TOPIC_PAGE_TPL.format(topic=topic.lower()),
                },
                errback=self.errback_log,
            )

        # --- Legacy tag mode ---
        for tag in self.seed_tags:
            url = TAG_API_TPL.format(page_id=1, last_id=0, tag=tag.lower())
            yield Request(
                url=url,
                callback=self.parse_tag_api,
                meta={"tag": tag, "page_id": 1, "last_id": 0},
                headers={
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": TAG_PAGE_TPL.format(tag=tag.lower()),
                },
                errback=self.errback_log,
            )

    def _load_existing_urls(self) -> None:
        """Read already-scraped art_urls from the raw JSONL manifest."""
        if self.overwrite:
            return
        try:
            raw_meta = Path(self.settings["RAW_METADATA_DIR"])
            raw_jsonl = raw_meta / "pixilart_raw.jsonl"
            records = read_jsonl(raw_jsonl)
            for r in records:
                url = r.get("art_url")
                if url:
                    self._seen_art_urls.add(normalize_url(url))
            # Seed the ID counter so new IDs don't collide
            if records:
                max_id = max((r.get("id") or 0 for r in records), default=0)
                set_counter_start(max_id)
            logger.info(
                "Loaded %d existing art URLs from manifest (overwrite=False)",
                len(self._seen_art_urls),
            )
        except Exception as exc:
            logger.warning("Could not load existing URLs: %s", exc)

    # ------------------------------------------------------------------
    # Tag API JSON parser  (primary entry point)
    # ------------------------------------------------------------------

    def parse_tag_api(self, response: Response) -> Iterator:
        """Parse the JSON response from /api/w/gallery/{page_id}/{last_id}/tags."""
        tag = response.meta.get("tag", "")
        page_id = response.meta.get("page_id", 1)

        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse API JSON: %s", response.url)
            return

        art_items = data.get("art", [])
        expect = data.get("expect", 0)

        if not art_items:
            logger.info("No more art items for tag '%s' (page_id=%d)", tag, page_id)
            return

        last_id = 0
        yielded = 0

        for art in art_items:
            if self._limit_reached():
                return

            # Build canonical art page URL
            art_url_path = art.get("url", "")
            if art_url_path and not art_url_path.startswith("http"):
                art_url_path = BASE + art_url_path
            art_url = normalize_url(art_url_path) if art_url_path else ""

            if not art_url or art_url in self._seen_art_urls:
                last_id = art.get("id", last_id)
                continue
            self._seen_art_urls.add(art_url)

            # Popularity filter — skip items below min_likes threshold
            art_likes = int(art.get("likes_count") or 0)
            if self.min_likes > 0 and art_likes < self.min_likes:
                last_id = art.get("id", last_id)
                logger.debug(
                    "Skipping (likes=%d < min_likes=%d): %s",
                    art_likes, self.min_likes, art_url,
                )
                continue

            # Prefer full resolution; fall back to watermarked image_url
            image_url = (
                art.get("full_image_url")
                or art.get("image_url")
                or art.get("thumb_image_url")
            )
            if not image_url:
                last_id = art.get("id", last_id)
                continue

            # Canvas size from API — skip if too large (same rule as topic path)
            _cw = art.get("width") or 0
            _ch = art.get("height") or 0
            if _cw > 128 or _ch > 128:
                last_id = art.get("id", last_id)
                logger.debug("Skipping (canvas_too_large %dx%d): %s", _cw, _ch, art_url)
                continue

            user = art.get("user", {})
            author = user.get("username", "") if isinstance(user, dict) else ""

            item = PixilartItem()
            item["id"]           = next_id()
            item["art_url"]      = art_url
            item["image_url"]    = image_url
            item["title"]        = art.get("title", "") or ""
            item["author"]       = author
            item["tags"]         = clean_tags([tag])
            item["published_at"] = art.get("created_at") or None
            item["source_tag"]   = tag
            item["scraped_at"]   = utc_now_iso()
            item["is_gif"]       = bool(art.get("is_gif"))
            item["likes_count"]  = int(art.get("likes_count") or 0)
            item["views"]        = int(art.get("views") or 0)
            # Canvas size — from API, same value used for the >128 skip above
            item["canvas_width_px"]    = _cw or None
            item["canvas_height_px"]   = _ch or None
            item["canvas_size_label"]  = f"{_cw}x{_ch}" if _cw and _ch else None
            item["canvas_pixel_count"] = _cw * _ch if _cw and _ch else None
            # Download metrics — filled by ImageDownloadPipeline
            item["width_px"]        = None
            item["height_px"]       = None
            item["size_label"]      = None
            item["pixel_count"]     = None
            item["aspect_ratio"]    = None
            item["is_square"]       = None
            item["file_size_bytes"] = None
            item["local_raw_path"]      = None
            item["local_filtered_path"] = None
            item["filter_status"]       = None
            item["review_status"]       = None
            item["reject_reason"]       = None

            last_id = art.get("id", last_id)
            self._item_count += 1
            yielded += 1
            yield item

        logger.info(
            "Tag '%s' page_id=%d: yielded %d items (expect=%d, last_id=%d)",
            tag, page_id, yielded, expect, last_id,
        )

        # Paginate: stop if the API returned fewer items than expected
        has_more = bool(art_items) and (expect == 0 or len(art_items) >= expect)
        if has_more and not self._limit_reached():
            next_url = TAG_API_TPL.format(
                page_id=page_id + 1, last_id=last_id, tag=tag.lower()
            )
            yield Request(
                url=next_url,
                callback=self.parse_tag_api,
                meta={"tag": tag, "page_id": page_id + 1, "last_id": last_id},
                headers={
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": TAG_PAGE_TPL.format(tag=tag.lower()),
                },
                errback=self.errback_log,
            )

    # ------------------------------------------------------------------
    # Topic API JSON parser  (primary entry point for topic mode)
    # ------------------------------------------------------------------

    def parse_topic_api(self, response: Response) -> Iterator:
        """Parse the JSON response from /api/w/gallery/{page_id}/{last_id}/topics."""
        topic = response.meta.get("topic", "")
        page_id = response.meta.get("page_id", 1)

        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse topic API JSON: %s", response.url)
            return

        art_items = data.get("art", [])
        expect = data.get("expect", 0)

        if not art_items:
            logger.info("No more art items for topic '%s' (page_id=%d)", topic, page_id)
            return

        last_id = 0
        yielded = 0

        for art in art_items:
            if self._limit_reached() or self._topic_limit_reached(topic):
                return

            art_url_path = art.get("url", "")
            if art_url_path and not art_url_path.startswith("http"):
                art_url_path = BASE + art_url_path
            art_url = normalize_url(art_url_path) if art_url_path else ""

            if not art_url or art_url in self._seen_art_urls:
                last_id = art.get("id", last_id)
                continue
            self._seen_art_urls.add(art_url)

            # Popularity filter — skip items below min_likes threshold
            art_likes = int(art.get("likes_count") or 0)
            if self.min_likes > 0 and art_likes < self.min_likes:
                last_id = art.get("id", last_id)
                logger.debug(
                    "Skipping (likes=%d < min_likes=%d): %s",
                    art_likes, self.min_likes, art_url,
                )
                continue

            # Canvas dimensions from API — the real pixel-art size
            canvas_w = art.get("width") or 0
            canvas_h = art.get("height") or 0
            canvas_too_large = canvas_w > 128 or canvas_h > 128

            image_url = (
                art.get("full_image_url")
                or art.get("image_url")
                or art.get("thumb_image_url")
            )
            if not image_url:
                last_id = art.get("id", last_id)
                continue

            user = art.get("user", {})
            author = user.get("username", "") if isinstance(user, dict) else ""

            item = PixilartItem()
            item["id"]           = next_id()
            item["art_url"]      = art_url
            item["image_url"]    = image_url
            item["title"]        = art.get("title", "") or ""
            item["author"]       = author
            item["tags"]         = clean_tags(art.get("tags") or [topic])
            item["published_at"] = art.get("created_at") or None
            item["source_tag"]   = topic
            item["scraped_at"]   = utc_now_iso()
            item["is_gif"]       = bool(art.get("is_gif"))
            item["likes_count"]  = art_likes
            item["views"]        = int(art.get("views") or 0)
            # Canvas size — preserved, never overwritten by pipelines
            item["canvas_width_px"]    = canvas_w or None
            item["canvas_height_px"]   = canvas_h or None
            item["canvas_size_label"]  = (
                f"{canvas_w}x{canvas_h}" if canvas_w and canvas_h else None
            )
            item["canvas_pixel_count"] = (
                canvas_w * canvas_h if canvas_w and canvas_h else None
            )
            # Download metrics — filled by ImageDownloadPipeline
            item["width_px"]        = None
            item["height_px"]       = None
            item["size_label"]      = None
            item["pixel_count"]     = None
            item["aspect_ratio"]    = None
            item["is_square"]       = None
            item["file_size_bytes"] = None
            item["local_raw_path"]      = None
            item["local_filtered_path"] = None
            item["review_status"]       = None

            if canvas_too_large:
                # Skip silently — not downloaded, not in rejected/, not visible in UI
                last_id = art.get("id", last_id)
                logger.debug(
                    "Skipping (canvas_too_large %dx%d): %s",
                    canvas_w, canvas_h, art_url,
                )
                continue

            item["filter_status"] = None  # let FilterPipeline decide
            item["reject_reason"] = None
            self._increment_topic(topic)

            last_id = art.get("id", last_id)
            yielded += 1
            yield item

        logger.info(
            "Topic '%s' page_id=%d: yielded %d items (expect=%d, last_id=%d, topic_total=%d)",
            topic, page_id, yielded, expect, last_id, self._topic_counts.get(topic, 0),
        )

        has_more = bool(art_items) and (expect == 0 or len(art_items) >= expect)
        if has_more and not self._limit_reached() and not self._topic_limit_reached(topic):
            next_url = TOPIC_API_TPL.format(
                page_id=page_id + 1, last_id=last_id, topic=topic.lower()
            )
            yield Request(
                url=next_url,
                callback=self.parse_topic_api,
                meta={"topic": topic, "page_id": page_id + 1, "last_id": last_id},
                headers={
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": TOPIC_PAGE_TPL.format(topic=topic.lower()),
                },
                errback=self.errback_log,
            )

    # ------------------------------------------------------------------
    # Legacy tag listing page parser  (kept as fallback, not called by default)
    # ------------------------------------------------------------------

    def parse_tag_page(self, response: Response) -> Iterator:
        """
        Parse a Pixilart tag listing page.

        Pixilart uses Next.js with client-side rendering — the server HTML
        may be an empty shell. We use 4 strategies in order:

          A) JSON body (API endpoint response)
          B) __NEXT_DATA__ JSON blob embedded in the HTML  ← primary for SSR pages
          C) Raw-text regex scan for /art/{slug} patterns  ← catches any embed
          D) HTML <a href="/art/..."> selectors            ← fallback if DOM is populated
        """
        tag = response.meta.get("tag", "")
        page = response.meta.get("page", 1)

        # --- Strategy A: JSON body ---
        content_type = response.headers.get("Content-Type", b"").decode(errors="ignore")
        if "json" in content_type or response.text.strip().startswith("{"):
            yield from self._parse_tag_json(response, tag, page)
            return

        # --- Strategy B: __NEXT_DATA__ JSON blob ---
        art_urls = self._extract_art_urls_from_next_data(response)

        # --- Strategy C: regex over full response text ---
        if not art_urls:
            art_urls = self._extract_art_urls_from_text(response.text)

        # --- Strategy D: HTML <a> CSS selector ---
        if not art_urls:
            for href in response.css("a::attr(href)").getall():
                path = urlparse(href).path
                if _ART_PATH_RE.match(path):
                    art_urls.add(normalize_url(urljoin(BASE, href)))

        found = 0
        for art_url in art_urls:
            if art_url in self._seen_art_urls or not is_art_url(art_url):
                continue
            self._seen_art_urls.add(art_url)
            found += 1
            if self._limit_reached():
                return
            yield Request(
                url=art_url,
                callback=self.parse_art_page,
                meta={"tag": tag},
                errback=self.errback_log,
            )

        if found == 0:
            logger.warning(
                "No art links found after all strategies: %s (page %d). "
                "Pixilart may be fully client-side rendered for this tag.",
                response.url, page,
            )
            return

        logger.info("Found %d art links on %s (page %d)", found, response.url, page)

        # Pagination: try common Next.js / paginated URL patterns
        next_page_url = self._next_page_url(response, tag, page)
        if next_page_url and not self._limit_reached():
            yield Request(
                url=next_page_url,
                callback=self.parse_tag_page,
                meta={"tag": tag, "page": page + 1},
                errback=self.errback_log,
            )

    # ------------------------------------------------------------------
    # Listing page extraction helpers
    # ------------------------------------------------------------------

    def _extract_art_urls_from_next_data(self, response: Response) -> set:
        """
        Parse __NEXT_DATA__ JSON from the page HTML and recursively search
        for all string values that look like Pixilart art URLs or slugs.
        """
        urls: set = set()
        raw = response.css("script#__NEXT_DATA__::text").get()
        if not raw:
            return urls
        try:
            nd = json.loads(raw)
        except json.JSONDecodeError:
            return urls

        # Recursively collect all string values from the JSON tree
        def collect_strings(obj, depth=0):
            if depth > 20:  # guard against absurdly deep structures
                return
            if isinstance(obj, str):
                # Match full URL or bare slug patterns
                if "/art/" in obj:
                    # Full URL
                    m = re.search(r'https?://(?:www\.)?pixilart\.com/art/([a-zA-Z0-9_-]+)', obj)
                    if m:
                        urls.add(normalize_url(f"{BASE}/art/{m.group(1)}"))
                elif re.match(r'^[a-zA-Z0-9_-]{5,}$', obj):
                    # Could be a bare slug — only add if surrounded by context later
                    pass
            elif isinstance(obj, dict):
                for v in obj.values():
                    collect_strings(v, depth + 1)
            elif isinstance(obj, list):
                for item in obj:
                    collect_strings(item, depth + 1)

        collect_strings(nd)
        logger.debug("__NEXT_DATA__ extraction found %d art URLs", len(urls))
        return urls

    def _extract_art_urls_from_text(self, text: str) -> set:
        """
        Regex scan over the raw HTML/JS text for any Pixilart art URLs.
        Catches URLs embedded in JSON-LD, inline scripts, or data attributes.
        """
        urls: set = set()
        for m in re.finditer(
            r'(?:https?://(?:www\.)?pixilart\.com)?/art/([a-zA-Z0-9_-]{5,})',
            text,
        ):
            full = normalize_url(f"{BASE}/art/{m.group(1)}")
            urls.add(full)
        return urls

    def _parse_tag_json(self, response: Response, tag: str, page: int) -> Iterator:
        """Handle JSON API responses for tag galleries."""
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.warning("Failed to JSON-decode tag response: %s", response.url)
            return

        # Recursively extract all art URLs from the JSON structure
        text_urls = self._extract_art_urls_from_text(response.text)

        found = 0
        for art_url in text_urls:
            if art_url in self._seen_art_urls or not is_art_url(art_url):
                continue
            self._seen_art_urls.add(art_url)
            found += 1
            if self._limit_reached():
                return
            yield Request(
                url=art_url,
                callback=self.parse_art_page,
                meta={"tag": tag},
                errback=self.errback_log,
            )

        # Also check standard list structures
        items = (
            data.get("data") or data.get("arts") or data.get("items")
            or (data if isinstance(data, list) else [])
        )
        if isinstance(items, list):
            for art in items:
                if not isinstance(art, dict):
                    continue
                slug = (
                    art.get("slug") or art.get("url")
                    or art.get("art_url") or art.get("permalink")
                )
                if not slug:
                    continue
                art_url = (
                    normalize_url(urljoin(BASE, f"/art/{slug}"))
                    if not slug.startswith("http") else normalize_url(slug)
                )
                if art_url in self._seen_art_urls or not is_art_url(art_url):
                    continue
                self._seen_art_urls.add(art_url)
                found += 1
                if self._limit_reached():
                    return
                yield Request(
                    url=art_url,
                    callback=self.parse_art_page,
                    meta={"tag": tag},
                    errback=self.errback_log,
                )

        if found > 0 and not self._limit_reached():
            next_url = TAG_API_TPL.format(tag=tag.lower(), page=page + 1)
            yield Request(
                url=next_url,
                callback=self.parse_tag_page,
                meta={"tag": tag, "page": page + 1},
                errback=self.errback_log,
            )

    def _next_page_url(self, response: Response, tag: str, page: int) -> Optional[str]:
        """Determine the next page URL for pagination."""
        # HTML next link
        next_href = (
            response.css('a[rel="next"]::attr(href)').get()
            or response.css("a.load-more::attr(href)").get()
            or response.css(".pagination .next a::attr(href)").get()
        )
        if next_href:
            return urljoin(BASE, next_href)
        # For gallery/tags pages, Pixilart uses ?page=N
        if "gallery/tags" in response.url:
            return f"{TAG_PAGE_TPL.format(tag=tag.lower())}?page={page + 1}"
        return None

    # ------------------------------------------------------------------
    # Art page parser
    # ------------------------------------------------------------------

    def parse_art_page(self, response: Response) -> Iterator:
        """
        Parse an individual art page and yield a PixilartItem.

        Extraction strategies (tried in order):
          1. __NEXT_DATA__ JSON blob in <script> tag  (Next.js apps)
          2. Structured JSON-LD (<script type="application/ld+json">)
          3. HTML selectors (CSS + XPath)
          4. Open Graph <meta> tags as last resort
        """
        tag = response.meta.get("tag", "")
        art_url = normalize_url(response.url)

        data = (
            self._extract_from_next_data(response)
            or self._extract_from_json_ld(response)
            or self._extract_from_html(response)
            or self._extract_from_og(response)
        )

        if not data or not data.get("image_url"):
            logger.warning("Could not extract image URL from: %s", art_url)
            return

        item = PixilartItem()
        item["id"]           = next_id()
        item["art_url"]      = art_url
        item["image_url"]    = data["image_url"]
        item["title"]        = data.get("title") or art_slug(art_url)
        item["author"]       = data.get("author") or ""
        item["tags"]         = clean_tags(data.get("tags") or [])
        item["published_at"] = data.get("published_at") or None
        item["source_tag"]   = tag
        item["scraped_at"]   = utc_now_iso()

        # Fields filled by pipelines
        item["local_raw_path"]      = None
        item["local_filtered_path"] = None
        item["width_px"]            = None
        item["height_px"]           = None
        item["size_label"]          = None
        item["pixel_count"]         = None
        item["aspect_ratio"]        = None
        item["is_square"]           = None
        item["file_size_bytes"]     = None
        item["is_gif"]              = None
        item["filter_status"]       = None
        item["review_status"]       = None
        item["reject_reason"]       = None

        self._item_count += 1
        yield item

    # ------------------------------------------------------------------
    # Extraction strategies
    # ------------------------------------------------------------------

    def _extract_from_next_data(self, response: Response) -> Optional[dict]:
        """
        Try to parse Next.js __NEXT_DATA__ JSON injected in the HTML.
        The JSON structure depends on the Pixilart version; adjust paths as needed.
        """
        next_data_raw = response.css("script#__NEXT_DATA__::text").get()
        if not next_data_raw:
            return None
        try:
            nd = json.loads(next_data_raw)
        except json.JSONDecodeError:
            return None

        # Navigate the Next.js page props — structure varies by Pixilart version
        # Common paths to try:
        props = nd.get("props", {})
        page_props = props.get("pageProps", {})

        art = (
            page_props.get("art")
            or page_props.get("artwork")
            or page_props.get("post")
            or page_props.get("data")
            or {}
        )

        if not art:
            return None

        image_url = (
            art.get("photoURL")
            or art.get("photo_url")
            or art.get("imageUrl")
            or art.get("image_url")
            or art.get("src")
        )
        if not image_url:
            return None

        # Tags can be a list of strings or a list of objects
        raw_tags = art.get("tags") or []
        if raw_tags and isinstance(raw_tags[0], dict):
            raw_tags = [t.get("tag") or t.get("name") or "" for t in raw_tags]

        return {
            "image_url":    image_url,
            "title":        art.get("title") or art.get("name"),
            "author":       art.get("username") or art.get("user") or art.get("author"),
            "tags":         raw_tags,
            "published_at": art.get("datePublished") or art.get("createdAt"),
        }

    def _extract_from_json_ld(self, response: Response) -> Optional[dict]:
        """Parse JSON-LD structured data (<script type='application/ld+json'>)."""
        for text in response.css('script[type="application/ld+json"]::text').getall():
            try:
                ld = json.loads(text)
            except json.JSONDecodeError:
                continue

            # Handle both single objects and @graph arrays
            nodes = ld if isinstance(ld, list) else [ld]
            for node in nodes:
                image_url = None
                if isinstance(node.get("image"), str):
                    image_url = node["image"]
                elif isinstance(node.get("image"), dict):
                    image_url = node["image"].get("url") or node["image"].get("contentUrl")
                elif isinstance(node.get("image"), list) and node["image"]:
                    first = node["image"][0]
                    image_url = first if isinstance(first, str) else first.get("url")

                if not image_url:
                    continue

                keywords = node.get("keywords") or ""
                tags = [k.strip() for k in keywords.split(",")] if keywords else []

                return {
                    "image_url":    image_url,
                    "title":        node.get("name") or node.get("headline"),
                    "author":       (node.get("author") or {}).get("name"),
                    "tags":         tags,
                    "published_at": node.get("datePublished"),
                }
        return None

    def _extract_from_html(self, response: Response) -> Optional[dict]:
        """
        Extract data using CSS/XPath selectors.

        NOTE: Selectors below are best guesses based on typical Pixilart markup.
              Verify against the live site and update as needed.
        """
        # Image — canvas element or img within the art viewer
        image_url = (
            response.css(".art-canvas img::attr(src)").get()
            or response.css(".artwork img::attr(src)").get()
            or response.css("img.art-image::attr(src)").get()
            or response.css('[data-art-image]::attr(src)').get()
            # The actual pixel art is sometimes a data URL on a canvas;
            # the downloadable PNG is often in a download link
            or response.css('a[download]::attr(href)').get()
            or response.css('a.download::attr(href)').get()
        )
        if not image_url:
            return None

        image_url = urljoin(BASE, image_url)

        # Title
        title = (
            response.css("h1.art-title::text").get()
            or response.css("h1::text").get()
            or response.css(".art-name::text").get()
            or ""
        ).strip()

        # Author
        author = (
            response.css(".art-author a::text").get()
            or response.css(".username::text").get()
            or response.css('[data-username]::attr(data-username)').get()
            or ""
        ).strip()

        # Tags
        tags = response.css(".art-tags a::text, .tag-list a::text, .tags a::text").getall()

        # Published date
        published_at = (
            response.css("time::attr(datetime)").get()
            or response.css("[datetime]::attr(datetime)").get()
        )

        return {
            "image_url":    image_url,
            "title":        title,
            "author":       author,
            "tags":         tags,
            "published_at": published_at,
        }

    def _extract_from_og(self, response: Response) -> Optional[dict]:
        """
        Last-resort extraction from Open Graph <meta> tags.
        og:image is almost always present and gives the canonical image URL.
        """
        image_url = (
            response.css('meta[property="og:image"]::attr(content)').get()
            or response.css('meta[name="twitter:image"]::attr(content)').get()
        )
        if not image_url:
            return None

        title = (
            response.css('meta[property="og:title"]::attr(content)').get()
            or response.css('meta[name="twitter:title"]::attr(content)').get()
            or ""
        ).strip()

        # Extract tags from meta keywords or description if available
        keywords = response.css('meta[name="keywords"]::attr(content)').get() or ""
        tags = [k.strip() for k in keywords.split(",") if k.strip()]

        return {
            "image_url":    image_url,
            "title":        title,
            "author":       "",
            "tags":         tags,
            "published_at": None,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _limit_reached(self) -> bool:
        if self.max_items > 0 and self._item_count >= self.max_items:
            logger.info("max_items=%d reached, stopping.", self.max_items)
            return True
        return False

    def _topic_limit_reached(self, topic: str) -> bool:
        if self.items_per_topic > 0 and self._topic_counts.get(topic, 0) >= self.items_per_topic:
            return True
        return False

    def _increment_topic(self, topic: str) -> None:
        self._topic_counts[topic] = self._topic_counts.get(topic, 0) + 1
        self._item_count += 1

    def errback_log(self, failure) -> None:
        logger.error("Request failed: %s — %s", failure.request.url, repr(failure.value))
