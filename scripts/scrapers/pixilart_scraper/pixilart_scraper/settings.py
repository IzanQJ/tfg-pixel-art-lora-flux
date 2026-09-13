from pathlib import Path

# ---------------------------------------------------------------------------
# Paths — resolved relative to this file so they work from any cwd
# ---------------------------------------------------------------------------
# settings.py lives at: scripts/scrapers/pixilart_scraper/pixilart_scraper/settings.py
# → parents[0] = pixilart_scraper/ (inner package)
# → parents[1] = pixilart_scraper/ (outer project)
# → parents[2] = scrapers/
# → parents[3] = scripts/
# → parents[4] = repo root
REPO_ROOT = Path(__file__).resolve().parents[4]
DATASETS_ROOT = REPO_ROOT / "datasets" / "pixilart"

RAW_IMAGES_DIR    = str(DATASETS_ROOT / "raw" / "images")
RAW_METADATA_DIR  = str(DATASETS_ROOT / "raw" / "metadata")
RAW_LOGS_DIR      = str(DATASETS_ROOT / "raw" / "logs")
ACCEPTED_DIR      = str(DATASETS_ROOT / "filtered" / "accepted")
REJECTED_DIR      = str(DATASETS_ROOT / "filtered" / "rejected")
FILTERED_META_DIR = str(DATASETS_ROOT / "filtered" / "metadata")
REPORTS_DIR       = str(DATASETS_ROOT / "reports")

# ---------------------------------------------------------------------------
# Scrapy core identity
# ---------------------------------------------------------------------------
BOT_NAME = "pixilart_scraper"
SPIDER_MODULES = ["pixilart_scraper.spiders"]
NEWSPIDER_MODULE = "pixilart_scraper.spiders"

# Identifiable user-agent — be transparent about who we are
USER_AGENT = (
    "PixilartResearchScraper/1.0 "
    "(+https://github.com/ostris/ai-toolkit; educational/research use)"
)

# ---------------------------------------------------------------------------
# Politeness — conservative settings
# ---------------------------------------------------------------------------
ROBOTSTXT_OBEY = True
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_DELAY = 2          # seconds between requests
RANDOMIZE_DOWNLOAD_DELAY = True  # actual delay: 1.0–3.0 s

COOKIES_ENABLED = False

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2
AUTOTHROTTLE_MAX_DELAY = 20
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
AUTOTHROTTLE_DEBUG = False

# ---------------------------------------------------------------------------
# Retries
# ---------------------------------------------------------------------------
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# ---------------------------------------------------------------------------
# HTTP cache (useful during development to avoid re-requesting pages)
# ---------------------------------------------------------------------------
HTTPCACHE_ENABLED = True
HTTPCACHE_EXPIRATION_SECS = 7200
HTTPCACHE_DIR = str(DATASETS_ROOT / "raw" / "logs" / "httpcache")
HTTPCACHE_IGNORE_HTTP_CODES = [404, 503, 429]

# ---------------------------------------------------------------------------
# Pipelines (order matters)
# ---------------------------------------------------------------------------
ITEM_PIPELINES = {
    "pixilart_scraper.pipelines.ImageDownloadPipeline": 100,
    "pixilart_scraper.pipelines.FilterPipeline":        200,
    "pixilart_scraper.pipelines.OrganizePipeline":      300,
    "pixilart_scraper.pipelines.ManifestPipeline":      400,
}

# ---------------------------------------------------------------------------
# Download timeout
# ---------------------------------------------------------------------------
DOWNLOAD_TIMEOUT = 30

# ---------------------------------------------------------------------------
# Default request headers
# ---------------------------------------------------------------------------
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = "INFO"
# LOG_FILE is set at runtime by run_spider.py / run_pixilart_scraper.py
