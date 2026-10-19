import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://oldschool.runescape.wiki/api.php"
USER_AGENT = "melvor-osrs-sprites/0.1 (personal Melvor Idle mod build)"
BUCKET_PAGE_SIZE = 5000
TITLES_PER_QUERY = 50


class Wiki:
    def __init__(self, cache_dir, refresh=False, delay_seconds=0.1):
        self.cache_dir = Path(cache_dir)
        self.refresh = refresh
        self.delay_seconds = delay_seconds

    def _fetch(self, url):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = response.read()
                time.sleep(self.delay_seconds)
                return body
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)

    def _cached(self, namespace, key, fetch):
        path = self.cache_dir / namespace / hashlib.sha1(key.encode()).hexdigest()
        if path.exists() and not self.refresh:
            return path.read_bytes()
        body = fetch()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        return body

    def api(self, params):
        params = {**params, "format": "json", "formatversion": "2"}
        url = API_URL + "?" + urllib.parse.urlencode(sorted(params.items()))
        return json.loads(self._cached("api", url, lambda: self._fetch(url)))

    def bucket(self, name, fields):
        selected = ",".join(f"'{field}'" for field in fields)
        rows = []
        while True:
            query = f"bucket('{name}').select({selected}).limit({BUCKET_PAGE_SIZE}).offset({len(rows)}).run()"
            page = self.api({"action": "bucket", "query": query})
            if "error" in page:
                raise RuntimeError(f"bucket {name}: {page['error']}")
            rows += page["bucket"]
            if len(page["bucket"]) < BUCKET_PAGE_SIZE:
                return rows

    def image_info(self, file_titles, thumb_size=None):
        info = {}
        titles = sorted(set(file_titles))
        for start in range(0, len(titles), TITLES_PER_QUERY):
            batch = titles[start:start + TITLES_PER_QUERY]
            params = {"action": "query", "titles": "|".join(batch), "prop": "imageinfo", "iiprop": "url|size"}
            if thumb_size:
                params["iiurlwidth"] = thumb_size
                params["iiurlheight"] = thumb_size
            result = self.api(params)["query"]
            normalized = {n["to"]: n["from"] for n in result.get("normalized", [])}
            for page in result["pages"]:
                if page.get("missing") or "imageinfo" not in page:
                    continue
                image = page["imageinfo"][0]
                url = (image.get("thumburl") if thumb_size else None) or image["url"]
                info[normalized.get(page["title"], page["title"])] = {
                    "url": url,
                    "width": image.get("width"),
                    "height": image.get("height"),
                }
        return info

    def download(self, url):
        return self._cached("files", url, lambda: self._fetch(url))
