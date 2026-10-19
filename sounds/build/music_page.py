"""Build the music review page: build/review/site/{index.html,icons.webp,clips/*.mp3}."""
import io
import json
import math
import re
import subprocess
from pathlib import Path

from PIL import Image

from build import CACHE, slug, track_title
from melvor import melvor_bytes
from wiki import Wiki

BUILD_DIR = Path(__file__).resolve().parent
SITE_DIR = BUILD_DIR / "review" / "site"
CELL = 72
COLUMNS = 20
CLIP_SECONDS = 20


def icon_cell(media):
    cell = Image.new("RGBA", (CELL, CELL))
    data = melvor_bytes(media, CACHE) if media else None
    try:
        image = Image.open(io.BytesIO(data)).convert("RGBA")
    except (OSError, TypeError):
        return cell
    image.thumbnail((CELL, CELL), Image.LANCZOS)
    cell.paste(image, ((CELL - image.width) // 2, (CELL - image.height) // 2))
    return cell


def clip(wiki, info, title, out_path):
    source = CACHE / "audio" / slug(title)
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(wiki.download(info[title]["url"]))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-t", str(CLIP_SECONDS),
                    "-af", f"loudnorm=I=-16:TP=-1.5,afade=t=out:st={CLIP_SECONDS - 2}:d=2", "-ac", "1",
                    "-c:a", "libmp3lame", "-b:a", "48k", str(out_path)], check=True)


def main():
    wiki = Wiki(CACHE)
    contexts = {c["id"]: c for c in json.loads((BUILD_DIR / "contexts.json").read_text())}
    proposals = json.loads((BUILD_DIR / "music_proposals.json").read_text())
    hints = {}
    for line in (BUILD_DIR / "osrs_tracks.tsv").read_text().splitlines():
        name, hint, _ = (line.split("\t") + ["", ""])[:3]
        hints.setdefault(name, hint)
    names = {t for p in proposals for t in [p["primary"]] + p.get("alternates", [])}
    info = wiki.image_info({track_title(n) for n in names})
    (SITE_DIR / "clips").mkdir(parents=True, exist_ok=True)
    clips = {}
    for name in sorted(names):
        title = track_title(name)
        path = SITE_DIR / "clips" / f"{slug(title)}.mp3"
        if not path.exists():
            clip(wiki, info, title, path)
        clips[name] = path.relative_to(SITE_DIR).as_posix()

    cells, rows = [], []
    for index, proposal in enumerate(proposals):
        context = contexts[proposal["id"]]
        cells.append(icon_cell(context.get("media")))
        tracks = [proposal["primary"]] + proposal.get("alternates", [])
        rows.append({
            "id": proposal["id"], "name": context["name"], "kind": context["kind"],
            "monsters": [re.sub(r"(?<!^)(?=[A-Z])", " ", m) for m in context.get("monsters", [])],
            "icon": index, "reason": proposal.get("reason", ""),
            "tracks": [{"name": re.sub(r" \(music track\)$", "", t), "hint": hints.get(t, ""), "clip": clips[t]} for t in tracks],
        })
    sheet = Image.new("RGBA", (COLUMNS * CELL, max(1, math.ceil(len(cells) / COLUMNS)) * CELL))
    for i, cell in enumerate(cells):
        sheet.paste(cell, ((i % COLUMNS) * CELL, (i // COLUMNS) * CELL))
    sheet.save(SITE_DIR / "icons.webp", "WEBP", quality=85)
    page = (BUILD_DIR / "review" / "template.html").read_text()
    page = page.replace("/*ROWS*/[]", json.dumps(rows)).replace("/*COLUMNS*/20", str(COLUMNS)).replace("/*CELL*/72", str(CELL))
    (SITE_DIR / "index.html").write_text(page)
    total = sum(p.stat().st_size for p in (SITE_DIR / "clips").glob("*.mp3")) / 1e6
    print(f"{len(rows)} contexts, {len(clips)} clips, {total:.1f} MB of previews")


if __name__ == "__main__":
    main()
