"""Copy the shared modules in core/ into each mod that lists them in its core.json, so every mod zip stays self-contained."""
import json
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORE = REPO / "core"


def bundle(mod_root):
    mod_root = Path(mod_root)
    names = json.loads((mod_root / "core.json").read_text())
    target = mod_root / "mod" / "core"
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    for name in names:
        shutil.copy2(CORE / name, target / name)
    return names


def mods():
    return sorted(path.parent for path in REPO.glob("*/core.json"))


if __name__ == "__main__":
    for mod_root in mods():
        print(f"{mod_root.name}: {', '.join(bundle(mod_root))}")
