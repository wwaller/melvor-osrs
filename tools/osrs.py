"""Build helpers the mods share: a cached OSRS Wiki client, pixel-art resizing, the RuneScape fonts and packaging."""
import io
import json
import math
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

import core

API_URL = "https://oldschool.runescape.wiki/api.php"
FONTS_URL = "https://github.com/RuneStar/fonts/releases/download/1.103-0/RuneScape-Fonts.zip"
ITEM_CANVAS = 28
MIN_ICON_SIZE = 64
TITLES_PER_QUERY = 50


class Wiki:
    def __init__(self, cache_dir, user_agent):
        self.cache = Path(cache_dir)
        self.user_agent = user_agent

    def fetch(self, url):
        path = self.cache / urllib.parse.quote(url, safe="")[:200]
        if not path.exists():
            request = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        return path.read_bytes()

    def urls(self, titles):
        """The download URL of each File: title that exists on the wiki, following redirects."""
        found = {}
        titles = sorted(set(titles))
        for start in range(0, len(titles), TITLES_PER_QUERY):
            params = {"action": "query", "titles": "|".join(titles[start:start + TITLES_PER_QUERY]), "prop": "imageinfo", "iiprop": "url",
                      "redirects": "1", "format": "json", "formatversion": "2"}
            while True:
                response = json.loads(self.fetch(f"{API_URL}?{urllib.parse.urlencode(params)}"))
                result = response["query"]
                aliases = {entry["to"]: entry["from"] for key in ("normalized", "redirects") for entry in result.get(key, [])}
                for page in result.get("pages", []):
                    if page.get("imageinfo"):
                        title = page["title"]
                        while title in aliases:
                            title = aliases[title]
                        found.setdefault(title, page["imageinfo"][0]["url"])
                # "iicontinue" means the batch's remaining files come in another part; any other "continue" only pages through older file versions.
                # Its parameters go first so the cache name, cut at 200 characters, still tells the parts apart.
                if "iicontinue" not in response.get("continue", {}):
                    break
                params = {**response["continue"], **{key: value for key, value in params.items() if key not in response["continue"]}}
        return found

    def file(self, title):
        url = self.urls([title]).get(title)
        if url is None:
            raise KeyError(f"{title} is not on the OSRS Wiki")
        return self.fetch(url)

    def image(self, title):
        return Image.open(io.BytesIO(self.file(title))).convert("RGBA")


def scaled(image, scale):
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def square(image, side=None):
    """Melvor draws mod icons in a square box: centre the art on a transparent square so it is not stretched."""
    side = side or max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def crisp(image):
    """Pad an OSRS item icon to a square and scale it up with hard pixels, the same way the Art mod does."""
    image = image.crop(image.getbbox())
    side = max(ITEM_CANVAS, image.width, image.height)
    return scaled(square(image, side), math.ceil(MIN_ICON_SIZE / side))


def fonts(wiki, folder, names):
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(wiki.fetch(FONTS_URL))) as bundle:
        for name in names:
            (folder / f"{name}.ttf").write_bytes(bundle.read(f"ttf/{name}.ttf"))


def package(root, archive_name):
    """Bundle the mod's core modules and zip mod/ into dist/."""
    root = Path(root)
    mod_dir = root / "mod"
    core.bundle(root)
    archive = root / "dist" / archive_name
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(mod_dir.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(mod_dir).parts):
                bundle.write(path, path.relative_to(mod_dir).as_posix())
    return archive
