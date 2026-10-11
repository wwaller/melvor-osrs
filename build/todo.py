"""Export unmatched base-game entities and OSRS name pools for the guessing pass."""
import colorsys
import json
from pathlib import Path

from PIL import Image

from build import BUILD_DIR, SKILL_ICONS, load_overrides, load_pools, match_entities
from melvor import STEAM_APP, load_entities
from wiki import Wiki

OUT_DIR = BUILD_DIR / "review"
HUES = ["red", "orange", "yellow", "lime", "green", "teal", "cyan", "blue", "indigo", "purple", "magenta", "pink"]


def describe_color(path):
    try:
        image = Image.open(path).convert("RGBA").resize((32, 32))
    except (FileNotFoundError, OSError):
        return ""
    pixels = [p for p in image.getdata() if p[3] > 128]
    if not pixels:
        return ""
    r, g, b = (sum(p[i] for p in pixels) / len(pixels) / 255 for i in range(3))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    shade = "dark " if l < 0.3 else "light " if l > 0.7 else ""
    if s < 0.18:
        return f"{shade}grey"
    return shade + HUES[int((h * 12 + 0.5) % 12)]


def main():
    cache_dir = BUILD_DIR / ".cache"
    wiki = Wiki(cache_dir)
    entities = load_entities(cache_dir)
    pools = load_pools(wiki)
    matches, _ = match_entities(entities, pools, load_overrides())
    covered = {e.media_path for e, *_ in matches} | set(SKILL_ICONS)

    todo, seen = [], {}
    for entity in entities:
        if not entity.is_base_game or entity.media_path in covered:
            continue
        if entity.media_path in seen:
            seen[entity.media_path]["also"].append(entity.name)
            continue
        row = {
            "id": entity.id,
            "kind": entity.kind,
            "name": entity.name,
            "category": entity.category,
            "type": entity.type,
            "description": entity.description[:220],
            "color": describe_color(STEAM_APP / entity.media_path),
            "media": entity.media_path,
            "also": [],
        }
        seen[entity.media_path] = row
        todo.append(row)

    (OUT_DIR / "pools").mkdir(parents=True, exist_ok=True)
    for pool, index in pools.items():
        lines = sorted({name for name, _ in index.values()})
        (OUT_DIR / "pools" / f"{pool}.txt").write_text("\n".join(lines) + "\n")
    used = sorted({osrs for e, osrs, *_ in matches if e.kind != "icon"})
    (OUT_DIR / "pools" / "already_used.txt").write_text("\n".join(used) + "\n")
    (OUT_DIR / "todo.json").write_text(json.dumps(todo, indent=1) + "\n")
    print(f"{len(todo)} unmatched base-game images exported")


if __name__ == "__main__":
    main()
