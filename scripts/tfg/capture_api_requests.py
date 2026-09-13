"""Use Playwright to capture the actual API requests Pixilart makes."""
import asyncio, json
from playwright.async_api import async_playwright

TAG = "pixelart"

async def capture_requests():
    all_requests = []
    json_responses = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
        )
        page = await context.new_page()
        
        async def handle_request(request):
            url = request.url
            if "pixilart.com" in url:
                all_requests.append(f"{request.method} {url}")
        
        async def handle_response(response):
            url = response.url
            if "pixilart.com" in url and response.status not in (301, 302, 303, 307, 308):
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    try:
                        body = await response.body()
                        data = json.loads(body)
                        art = data.get("art", [])
                        json_responses.append({
                            "url": url, "status": response.status,
                            "art_count": len(art),
                            "keys": list(data.keys())[:10],
                            "sample": str(art[0])[:200] if art else None
                        })
                    except Exception as e:
                        json_responses.append({"url": url, "err": str(e)})
        
        page.on("request", handle_request)
        page.on("response", handle_response)
        
        print(f"Navigating to gallery/tags/{TAG}...")
        try:
            await page.goto(f"https://www.pixilart.com/gallery/tags/{TAG}", 
                           wait_until="load", timeout=20000)
        except Exception as e:
            print(f"Goto error (continuing): {e}")
        
        # Wait for JS to execute and make API calls
        await asyncio.sleep(5)
        
        title = await page.title()
        print(f"Page title: {title}")
        
        art_count = await page.locator("a[href*='/art/']").count()
        print(f"Art links on page: {art_count}")
        
        print(f"\n=== All requests to pixilart.com ({len(all_requests)} total) ===")
        for r in all_requests:
            print(f"  {r}")
        
        print(f"\n=== JSON responses ({len(json_responses)}) ===")
        for r in json_responses:
            print(json.dumps(r, indent=2))
        
        await browser.close()

asyncio.run(capture_requests())
