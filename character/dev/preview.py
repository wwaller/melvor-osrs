"""Render test outfits with the in-game renderer in headless Chrome and save screenshots to dev/preview/."""
import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DATA_DIR = ROOT / "mod" / "data"


def test_data(items, pose):
    data = json.loads((DATA_DIR / "base.json").read_text())
    data["items"] = {}
    held = [value - 512 for value in (data["poses"][str(pose)]["left"], data["poses"][str(pose)]["right"]) if value >= 512]
    for item_id in set(items) | set(held):
        item_file = json.loads((DATA_DIR / "items" / f"{item_id}.json").read_text())
        data["items"][item_id] = item_file["item"]
        data["models"].update(item_file["models"])
    return data


def page(items, yaw, pitch, female, width, height, background="#292929", pose=808, frame=0):
    module = (ROOT / "mod" / "character.mjs").as_uri()
    options = json.dumps({"female": female, "pose": pose, "frame": frame})
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:{background}}}canvas{{display:block;width:{width}px;height:{height}px}}</style></head>
<body><canvas id="view" width="{width * 2}" height="{height * 2}"></canvas><script type="module">
import {{ createRenderer, posedPlayer }} from "{module}";
const data = {json.dumps(test_data(items, pose))};
const model = posedPlayer(data, {json.dumps(items)}, {options});
createRenderer(document.getElementById("view")).draw(model, {{ yaw: {yaw}, pitch: {pitch} }});
</script></body></html>"""


def shoot(html, out, width, height):
    path = OUT / f"{out.stem}.html"
    path.write_text(html)
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run",
                                   "--force-device-scale-factor=2", "--use-mock-keychain", "--password-store=basic", "--allow-file-access-from-files",
                                   f"--user-data-dir={profile}", "--virtual-time-budget=5000", f"--window-size={width},{height}", f"--screenshot={out}", path.as_uri()],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(160):
            if out.exists() and out.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.25)
        chrome.kill()
        chrome.wait()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("items", nargs="*", type=lambda value: int(value) if value.isdigit() else value, default=[1163, 1127, 1079, 1201, 1333])
    parser.add_argument("--yaw", type=int, default=128)
    parser.add_argument("--pitch", type=int, default=96)
    parser.add_argument("--female", action="store_true")
    parser.add_argument("--name", default="player")
    parser.add_argument("--pose", type=int, default=808)
    parser.add_argument("--frame", type=int, default=0)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{args.name}.png"
    shoot(page(args.items, args.yaw, args.pitch, args.female, 300, 600, pose=args.pose, frame=args.frame), out, 300, 600)
    print(out)


if __name__ == "__main__":
    main()
