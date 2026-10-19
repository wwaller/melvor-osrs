"""Hook the OSRS sprites mod into the Steam (NW.js) build of Melvor Idle for local testing."""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOADER_NAME = "osrs-sprites-dev.js"
SCRIPT_TAG = f'<script type="text/javascript" src="{LOADER_NAME}"></script>'
DEFAULT_GAME_DIR = Path.home() / "Library/Application Support/Steam/steamapps/common/Melvor Idle"


def app_dirs(game_dir):
    found = sorted(game_dir.glob("*.app/Contents/Resources/app.nw")) or sorted(game_dir.glob("package.nw"))
    if not found:
        raise SystemExit(f"no NW.js app found under {game_dir}")
    return found


def install(app_dir):
    index = app_dir / "index.html"
    backup = app_dir / "index.html.osrs-sprites-backup"
    if not backup.exists():
        shutil.copy2(index, backup)
    loader = (ROOT / "dev" / "steam-loader.js").read_text()
    loader = loader.replace("__MOD_DIR__", json.dumps(str(ROOT / "mod")))
    loader = loader.replace("__STATUS_FILE__", json.dumps(str(ROOT / "dev" / "last-run.json")))
    (app_dir / LOADER_NAME).write_text(loader)
    html = index.read_text()
    if SCRIPT_TAG not in html:
        html = html.replace("</head>", f"\t\t{SCRIPT_TAG}\n\t</head>", 1)
        index.write_text(html)
    print(f"installed into {app_dir}")


def uninstall(app_dir):
    backup = app_dir / "index.html.osrs-sprites-backup"
    if backup.exists():
        shutil.move(backup, app_dir / "index.html")
    (app_dir / LOADER_NAME).unlink(missing_ok=True)
    print(f"removed from {app_dir}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--game-dir", type=Path, default=DEFAULT_GAME_DIR)
    parser.add_argument("--uninstall", action="store_true")
    args = parser.parse_args()
    if not args.uninstall and not (ROOT / "mod" / "mapping.json").exists():
        raise SystemExit("run build/build.py first")
    for app_dir in app_dirs(args.game_dir):
        (uninstall if args.uninstall else install)(app_dir)


if __name__ == "__main__":
    main()
