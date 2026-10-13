"""Run setup.mjs on a mock Melvor skill page in headless Chrome, open the flyout, and screenshot it."""
import functools
import http.server
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MEDIA = "https://cdn2-main.melvor.net/assets/media/skills"

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/oneui.css"><link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/game.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css"><link rel="stylesheet" href="https://unpkg.com/tippy.js@6/dist/tippy.css">
<script src="https://unpkg.com/@popperjs/core@2"></script><script src="https://unpkg.com/tippy.js@6"></script>
<style>body{background:#1f2329;height:700px}</style></head><body class="darkMode">
<div class="sidemenu bg-white rounded" id="skill-footer-minibar-container">
  <div id="skill-footer-minibar"><button class="btn btn-sm btn-light"><img class="skill-icon-xs m-0" src="https://cdn2-main.melvor.net/assets/media/main/milestones_header.png"></button>
  <button class="btn btn-sm btn-light"><img class="skill-icon-xs m-0" src="https://cdn2-main.melvor.net/assets/media/main/mastery_header.png"></button></div>
  <button class="btn btn-sm btn-light text-white" style="width:42px; height:34px;"><i class="si si-arrow-down"></i></button>
</div>
<script type="module">
const MEDIA = "MEDIA_URL";
const names = [["Woodcutting", "woodcutting"], ["Fishing", "fishing"], ["Firemaking", "firemaking"], ["Cooking", "cooking"], ["Mining", "mining"], ["Smithing", "smithing"],
  ["Thieving", "thieving"], ["Fletching", "fletching"], ["Crafting", "crafting"], ["Runecrafting", "runecrafting"], ["Herblore", "herblore"], ["Agility", "agility"],
  ["Summoning", "summoning"], ["Astrology", "astrology"], ["Alt. Magic", "magic"]];
const passive = [["Farming", "farming"], ["Township", "township"]];
const active = new Set(["Woodcutting", "Fishing"]);
const page = (name, file, category) => ({ id: "p:" + name, name, media: `${MEDIA}/${file}/${file}.png`, action: { isActive: active.has(name) }, skillSidebarCategoryID: category });
const pages = { "melvorD:Combat": { id: "melvorD:Combat", name: "Combat", media: `${MEDIA}/combat/combat.png`, action: { isActive: false } },
  "melvorD:Bank": { id: "melvorD:Bank", name: "Bank", media: "https://cdn2-main.melvor.net/assets/media/main/bank_header.png" },
  "melvorD:Shop": { id: "melvorD:Shop", name: "Shop", media: "https://cdn2-main.melvor.net/assets/media/main/shop_header.png" } };
const skills = {};
const items = { Combat: [{ id: "melvorD:Combat", rootEl: document.createElement("li") }], Passive: [], "Non-Combat": [] };
for (const [list, category] of [[passive, "Passive"], [names, "Non-Combat"]]) {
  for (const [name, file] of list) {
    const id = "s:" + name;
    pages[id] = page(name, file, category === "Passive" ? "Passive" : undefined);
    skills[id] = { id, name, media: pages[id].media };
    const rootEl = document.createElement("li");
    if (name === "Astrology") rootEl.classList.add("opacity-50");
    items[category].push({ id, rootEl });
  }
}
window.sidebar = { category: (id) => ({ items: () => items[id] }) };
window.game = { pages: { getObjectByID: (id) => pages[id] }, skills: { getObjectByID: (id) => skills[id] }, getPagesForSkill: (s) => [pages[s.id]], openPage: pages["s:Woodcutting"] };
window.changePage = () => {};
window.Minibar = class Minibar { setSkill() {} };
window.Game = class Game { renderActiveSkills() {} };
let instance;
const realTippy = window.tippy;
window.tippy = (target, options) => (instance = realTippy(target, options));
let ready;
const ctx = { settings: { section: () => ({ add() {}, get: (name) => name === "bank-and-shop" }) }, loadStylesheet: (p) => document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="/mod/${p}">`), patch: () => ({ after() {}, replace() {} }), onInterfaceReady: (fn) => (ready = fn) };
const { setup } = await import("/mod/setup.mjs");
setup(ctx);
ready();
await new Promise((r) => setTimeout(r, 300));
instance.show();
</script></body></html>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(PAGE.replace("MEDIA_URL", MEDIA))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    shot = OUT / "flyout.png"
    shot.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([CHROME, "--headless=new", "--hide-scrollbars", "--no-first-run", "--force-device-scale-factor=2", "--use-mock-keychain",
                                   f"--user-data-dir={profile}", "--virtual-time-budget=8000", "--window-size=520,700", f"--screenshot={shot}",
                                   f"http://127.0.0.1:{server.server_address[1]}/dev/preview/index.html"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(160):
            if shot.exists() and shot.stat().st_size:
                time.sleep(0.5)
                break
            time.sleep(0.25)
        chrome.kill()
        chrome.wait()
    server.shutdown()
    print(shot)


if __name__ == "__main__":
    main()
