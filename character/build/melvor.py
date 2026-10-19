"""Melvor Idle equipment from the game's data packages."""
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

DATA_URL = "https://steam.melvoridle.com/assets/data/{package}.json"
PACKAGES = ["melvorDemo", "melvorFull", "melvorTotH", "melvorExpansion2", "melvorItA"]


@dataclass(frozen=True)
class Equipment:
    id: str
    name: str
    slot: str
    media: str
    package: str


def _package(package, cache_dir):
    path = Path(cache_dir) / "melvor" / f"{package}.json"
    if not path.exists():
        request = urllib.request.Request(DATA_URL.format(package=package), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return json.loads(path.read_text())


def load_equipment(cache_dir):
    equipment = []
    for package in PACKAGES:
        document = _package(package, cache_dir)
        for item in document["data"].get("items", []):
            if item.get("validSlots") and item.get("name"):
                equipment.append(Equipment(f"{document['namespace']}:{item['id']}", item["name"], item["validSlots"][0], item.get("media", "").split("?", 1)[0], package))
    return equipment
