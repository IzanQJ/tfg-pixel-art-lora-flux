"""
middlewares.py — Custom Scrapy middlewares for the Pixilart scraper.

Included:
- RateLimitRetryMiddleware : back off on HTTP 429 (Too Many Requests)
- RotateHeadersMiddleware  : vary Accept-Language slightly per request
"""

from __future__ import annotations

import logging
import random
import time

from scrapy import signals
from scrapy.http import Response

logger = logging.getLogger(__name__)


class RateLimitRetryMiddleware:
    """
    On HTTP 429, wait for a short back-off period before retrying.
    Works together with the built-in RetryMiddleware (run after it
    or in place of it by adjusting DOWNLOADER_MIDDLEWARES order).
    """

    BACKOFF_BASE = 10   # seconds base wait
    BACKOFF_MAX  = 60   # seconds max wait
    MAX_RETRIES  = 3

    def process_response(self, request, response, spider):
        if response.status == 429:
            retries = request.meta.get("_429_retries", 0)
            if retries < self.MAX_RETRIES:
                wait = min(self.BACKOFF_BASE * (2 ** retries), self.BACKOFF_MAX)
                wait += random.uniform(0, 3)
                logger.warning(
                    "HTTP 429 on %s — backing off %.1fs (retry %d/%d)",
                    request.url,
                    wait,
                    retries + 1,
                    self.MAX_RETRIES,
                )
                time.sleep(wait)
                new_request = request.copy()
                new_request.meta["_429_retries"] = retries + 1
                new_request.dont_filter = True
                return new_request
            else:
                logger.error("HTTP 429 — max retries exceeded for %s", request.url)
        return response

    def process_exception(self, request, exception, spider):
        return None


class RotateHeadersMiddleware:
    """
    Randomly vary the Accept-Language header to reduce fingerprinting.
    """

    _LANGUAGES = [
        "en-US,en;q=0.9",
        "en-GB,en;q=0.8",
        "en;q=0.9",
        "en-US,en;q=0.8,es;q=0.5",
    ]

    def process_request(self, request, spider):
        request.headers["Accept-Language"] = random.choice(self._LANGUAGES)
        return None
