import scrapy


class PixilartItem(scrapy.Item):
    # ------------------------------------------------------------------
    # Identity / provenance
    # ------------------------------------------------------------------
    id          = scrapy.Field()   # sequential int, e.g. 1, 2, 3
    art_url     = scrapy.Field()   # https://www.pixilart.com/art/slug
    image_url   = scrapy.Field()   # direct image CDN URL
    title       = scrapy.Field()
    author      = scrapy.Field()
    tags        = scrapy.Field()   # list[str]
    published_at = scrapy.Field()  # ISO string or None
    source_tag  = scrapy.Field()   # seed tag or topic that led to this item

    # ------------------------------------------------------------------
    # Local paths (filled by pipelines)
    # ------------------------------------------------------------------
    local_raw_path      = scrapy.Field()  # absolute path in raw/images/
    local_filtered_path = scrapy.Field()  # absolute path in accepted/ or rejected/

    # ------------------------------------------------------------------
    # Canvas / pixel-art size  (set by spider from API, never overwritten)
    # ------------------------------------------------------------------
    canvas_width_px   = scrapy.Field()  # e.g. 32  — actual pixel-art canvas
    canvas_height_px  = scrapy.Field()  # e.g. 32
    canvas_size_label = scrapy.Field()  # e.g. "32x32"
    canvas_pixel_count = scrapy.Field() # canvas_width * canvas_height

    # ------------------------------------------------------------------
    # Downloaded-image metrics (filled by ImageDownloadPipeline via Pillow)
    # The exported PNG is always ~1200 px regardless of canvas size.
    # ------------------------------------------------------------------
    width_px        = scrapy.Field()   # Pillow width of downloaded file
    height_px       = scrapy.Field()   # Pillow height of downloaded file
    size_label      = scrapy.Field()   # e.g. "1200x1200"
    pixel_count     = scrapy.Field()   # width_px * height_px
    aspect_ratio    = scrapy.Field()   # float, rounded to 4 decimal places
    is_square       = scrapy.Field()   # bool
    file_size_bytes = scrapy.Field()   # int, actual on-disk bytes
    is_gif          = scrapy.Field()   # bool

    # ------------------------------------------------------------------
    # Filtering
    # ------------------------------------------------------------------
    filter_status  = scrapy.Field()  # "accepted" | "rejected" | "review"
    review_status  = scrapy.Field()  # "auto" | "pending_review"
    reject_reason  = scrapy.Field()  # human-readable string or None

    # ------------------------------------------------------------------
    # Popularity metrics (from Pixilart API)
    # ------------------------------------------------------------------
    likes_count = scrapy.Field()   # int — number of likes/hearts on this art
    views       = scrapy.Field()   # int — view count

    # ------------------------------------------------------------------
    # Timestamps
    # ------------------------------------------------------------------
    scraped_at = scrapy.Field()      # ISO UTC timestamp
