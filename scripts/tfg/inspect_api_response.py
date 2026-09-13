import urllib.request, json
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
url = 'https://www.pixilart.com/api/w/gallery/1/0/tags?user=true&liked=true&comments=true&sub=pixelart&sub_sec=new'
h = {'User-Agent': UA, 'Accept': 'application/json, */*', 'Referer': 'https://www.pixilart.com/gallery/tags/pixelart', 'X-Requested-With': 'XMLHttpRequest'}
req = urllib.request.Request(url, headers=h)
with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read())
art = data['art']
print(f'Total items: {len(art)}')
print(f'expect: {data.get("expect")}')
print('First item keys:', list(art[0].keys()))
print('Sample:', json.dumps(art[0], indent=2)[:1000])
