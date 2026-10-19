"""Contact sheet of the combat view's OSRS monsters: each one standing, mid-attack, mid-block and dead, saved to dev/preview/."""
import argparse
import functools
import http.server
import json
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CELL = 150
KINDS = [("stand", 0), ("attack", 0.5), ("block", 0.5), ("death", 0.7)]


def page(files, columns):
    names = json.dumps([path.name for path in files])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin: 0; background: #2a241d; color: #ffff00; font: 11px monospace; }}
.grid {{ display: grid; grid-template-columns: repeat({columns}, {CELL * 4 // 3 * len(KINDS)}px); }}
.monster {{ position: relative; display: flex; outline: 1px solid #000; }}
.monster span {{ position: absolute; left: 3px; top: 2px; text-shadow: 1px 1px 0 #000; }}
canvas {{ width: {CELL * 4 // 3}px; height: {CELL}px; }}
</style></head><body><div class="grid" id="grid"></div><script type="module">
import * as character from "/mod/character.mjs";
const kinds = {json.dumps(KINDS)};
const grid = document.getElementById("grid");
const shared = document.createElement("canvas");
shared.width = {CELL * 8 // 3};
shared.height = {CELL * 2};
const renderer = character.createRenderer(shared);
for (const name of {names}) {{
  const data = await (await fetch(`/mod/data/monsters/${{name}}`)).json();
  const cell = document.createElement("div");
  cell.className = "monster";
  const npc = data.npcs[0];
  const label = document.createElement("span");
  label.textContent = `${{data.monster.split(":")[1]}} (${{Object.keys(npc.poses).join(" ")}})`;
  const lit = character.npcModel(data, npc);
  const reference = character.posedNpc(data, lit, npc, "stand", 0);
  const body = character.bodyOf(reference);
  const fit = Math.min(({CELL * 2} * 0.75) / (body.height + body.lift), ({CELL * 8 // 3} * 0.25) / body.radius);
  const place = {{ fit, x: {CELL * 8 // 3} * 0.7, ground: {CELL * 2} * 0.92 }};
  for (const [kind, at] of kinds) {{
    const canvas = document.createElement("canvas");
    canvas.width = {CELL * 8 // 3};
    canvas.height = {CELL * 2};
    cell.append(canvas);
    const pose = character.npcPose(data, npc, kind);
    const frame = pose && npc.poses[kind] ? Math.min(pose.frames.length - 1, Math.floor(at * pose.frames.length)) : 0;
    const shown = npc.poses[kind] ? kind : "stand";
    renderer.draw(character.posedNpc(data, lit, npc, shown, frame), {{ yaw: 640, reference, place }});
    canvas.getContext("2d").drawImage(shared, 0, 0);
  }}
  cell.append(label);
  grid.append(cell);
}}
document.title = "done";
</script></body></html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="monster file names to show")
    parser.add_argument("--name", default="monsters")
    parser.add_argument("--columns", type=int, default=2)
    args = parser.parse_args()
    files = sorted((ROOT / "mod" / "data" / "monsters").glob("*.json"))
    if args.only:
        files = [path for path in files if any(key.lower() in path.name.lower() for key in args.only)]
    OUT.mkdir(parents=True, exist_ok=True)
    (ROOT / "dev" / "preview" / f"{args.name}.html").write_text(page(files, args.columns))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    server.RequestHandlerClass.log_message = lambda *a: None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    rows = -(-len(files) // args.columns)
    width, height = CELL * 4 // 3 * len(KINDS) * args.columns, CELL * rows
    out = OUT / f"{args.name}.png"
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run",
                        "--use-mock-keychain", "--password-store=basic", f"--user-data-dir={profile}", "--virtual-time-budget=60000",
                        f"--window-size={width},{height}", f"--screenshot={out}", f"http://127.0.0.1:{server.server_address[1]}/dev/preview/{args.name}.html"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    server.shutdown()
    print(out, f"{len(files)} monsters")


if __name__ == "__main__":
    main()
