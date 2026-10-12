"""Run setup.mjs against a mock Melvor combat page in headless Chrome, open the Character Preview tab, and screenshot it."""
import functools
import json
import http.server
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "build"))

from build import CACHE  # noqa: E402
from melvor import load_equipment  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCENARIOS = [
    ("panel", None, {}),
    ("panel-collapsed", True, {}),
    ("panel-fishing", None, {"active": "fishing", "fish": "melvorD:Raw_Swordfish"}),
    ("panel-woodcutting", None, {"active": "woodcutting", "tools": {"melvorD:Axe": "Rune_Axe"}}),
    ("panel-mining", None, {"active": "mining", "tools": {"melvorD:Pickaxe": "Dragon_Pickaxe"}}),
    ("panel-cooking", None, {"active": "cooking", "category": "melvorD:Fire"}),
    ("panel-smithing", None, {"active": "smithing", "category": "melvorD:Bars"}),
    ("panel-fletching", None, {"active": "fletching", "category": "melvorD:Shortbows"}),
    ("panel-herblore", None, {"active": "herblore"}),
    ("panel-firemaking", None, {"active": "firemaking"}),
    ("panel-thieving", None, {"active": "thieving", "stunned": False}),
    ("panel-crafting", None, {"active": "crafting", "category": "melvorF:LeatherArmour"}),
    ("panel-runecrafting", None, {"active": "runecrafting", "category": "melvorF:StandardRunes"}),
    ("panel-combat", None, {"attacking": True}),
    ("panel-combat-mobile", None, {"attacking": True, "width": 360, "monster": "monster-wide.png"}),
    ("panel-enchanted", None, {"enchanted": True}),
    ("panel-multitasking", None, {"attacking": True, "active": "fishing", "fish": "melvorD:Raw_Swordfish"}),
]
WORN = ["melvorD:Rune_Helmet", "melvorD:Rune_Platebody", "melvorD:Rune_Platelegs", "melvorD:Rune_Shield", "melvorD:Rune_Scimitar", "melvorD:Leather_Boots"]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/oneui.css"><link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/themes/amethyst.min.css"><link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/game.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
<style>body{background:#1f2329}#combat-player-container{width:420px;padding:8px}</style></head><body class="darkMode">
<div style="display:flex;gap:16px;align-items:flex-start">
<div class="block block-rounded-double bg-combat-inner-dark text-center pb-1 mb-2" style="width:520px;margin:8px">
  <div class="block-header block-header-default bg-combat-enemy-name-block-header px-3 py-1 mb-0"><h5 class="font-size-md font-w600 mb-0 w-100 text-center"><span class="text-light">Hill Giant</span></h5></div>
  <div class="bg-dark-bank-block-header px-3 py-1 mb-1"><h5 class="font-w600 font-size-sm mb-0"><small>Hill Giant Lair</small></h5></div>
  <div class="row no-gutters px-2"><div class="col-12" style="position:relative"><div class="row no-gutters">
    <div class="col-12"><div id="combat-enemy-img" style="height:260px;"><img class="combat-enemy-img" src="monster.png"></div></div>
  </div><div style="position:absolute;top:-4px;left:-6px;background:#222;padding:4px 8px;font-size:12px">levels</div></div></div>
</div>
<div id="combat-player-container">
  <div id="combat-menu-0">
    <div class="block block-rounded-double bg-combat-inner-dark text-center p-0 mb-2">
      <div class="block-header block-header-default bg-dark-bank-block-header px-3 py-1 mb-1"><h5 class="font-size-sm font-w600 mb-0 w-100 text-center">Equipment</h5></div>
      <p class="text-combat-smoke py-3 mb-0">equipment grid</p>
    </div>
    <div class="block block-rounded-double bg-combat-inner-dark text-center mb-2" id="combat-attack-styles">
      <div class="block-header block-header-default bg-dark-bank-block-header px-3 py-1 mb-1"><h5 class="font-size-sm font-w600 mb-0 w-100 text-center">Attack Style</h5></div>
      <p class="text-combat-smoke py-2 mb-0">attack styles</p>
    </div>
  </div>
</div>
</div>
<script type="module">
const PORT_ROOT = location.origin + "/mod/";
const listeners = {};
const scenario = SCENARIO_JSON;
const enchant = (item) => ({ id: "enchanting:e" + Math.random().toString(36).slice(-5), item, name: "Epic " + item.name, get _media() { return item._media; }, get media() { return item.media + "#q=3"; } });
const worn = WORN_JSON.map((item) => ({ isEmpty: false, occupiedBy: undefined, item: scenario.enchanted ? enchant(item) : item }));
window.Player = class { attack() {} };
const player = Object.assign(new Player(), {
  equipment: { equippedArray: worn, equippedItems: { "melvorD:Weapon": worn.find((slot) => /Scimitar/.test(slot.item.id)) } },
  attackType: "melee", attackStyle: { id: "melvorD:Slash" },
  on: (event, fn) => { (listeners[event] ??= []).push(fn); },
});
const skill = (name) => ({ isActive: scenario.active === name, activeRecipe: { category: { id: scenario.category } }, activeFish: { product: { id: scenario.fish } }, stunState: scenario.stunned ? 1 : 0 });
window.CombatManager = class { onSelection() {} stop() {} };
window.game = { combat: Object.assign(new CombatManager(), { player, isActive: Boolean(scenario.attacking) }), shop: { upgradeChains: { getObjectByID: (id) => ({ rootUpgrade: id }) }, getLowestUpgradeInChain: (root) => (scenario.tools?.[root] ? { localID: scenario.tools[root] } : undefined) } };
for (const name of ["fishing", "woodcutting", "mining", "cooking", "smithing", "fletching", "crafting", "runecrafting", "herblore", "firemaking", "thieving"]) game[name] = skill(name);
if (scenario.attacking) setInterval(() => player.attack(), 1000);
window.mod = { getContext: () => { throw new Error("not loaded"); } };
const values = {};
const stored = new Map(COLLAPSED === null ? [] : [["collapsed", COLLAPSED]]);
let ready;
const ctx = {
  loadModule: (path) => import(PORT_ROOT + path),
  loadStylesheet: (path) => document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${PORT_ROOT + path}">`),
  loadData: (path) => fetch(PORT_ROOT + path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); }),
  getResourceUrl: (path) => PORT_ROOT + path,
  settings: { section: () => ({ add: (list) => list.forEach((s) => (values[s.name] = s.default)), get: (name) => values[name] }) },
  patch: (owner, name) => ({ replace: (hook) => { const original = owner.prototype[name]; owner.prototype[name] = function (...args) { return hook.call(this, original.bind(this), ...args); }; } }),
  accountStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  onInterfaceReady: (fn) => (ready = fn),
};
const { setup } = await import(PORT_ROOT + "setup.mjs");
await setup(ctx);
ready();
await new Promise((resolve) => setTimeout(resolve, 1500));
const canvas = document.querySelector("#osrs-character-preview canvas");
const snapshots = [];
for (let i = 0; i < 6; i++) {
  snapshots.push(canvas.toDataURL().length + ":" + canvas.toDataURL().slice(-40));
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const monster = document.querySelector(".combat-enemy-img").getBoundingClientRect();
const stageBox = document.querySelector("#osrs-character-combat-stage canvas").getBoundingClientRect();
const overflow = Math.round(monster.right - document.querySelector("#combat-enemy-img").getBoundingClientRect().right);
const feet = stageBox.bottom - parseFloat(document.querySelector("#osrs-character-combat-stage").style.getPropertyValue("--osrs-character-ground") || "0");
document.body.insertAdjacentHTML("beforeend", `<pre id="result" style="color:#ff0;font-size:16px;padding:8px">${new Set(snapshots).size} distinct frames in ${snapshots.length} samples, monster overflow ${overflow}px, monster top ${Math.round(monster.top - stageBox.top)}px, monster feet ${Math.round(monster.bottom - stageBox.top)}px, stage ${Math.round(document.querySelector('#osrs-character-combat-stage').getBoundingClientRect().height)}px, feet ${Math.round(feet - stageBox.top)}px</pre>`);
</script></body></html>"""


def worn_items(worn):
    equipment = {e.id: e for e in load_equipment(CACHE)}
    return [{"id": e.id, "name": e.name, "_media": e.media, "media": e.media} for e in (equipment[melvor_id] for melvor_id in worn)]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def page(collapsed, scenario):
    return PAGE.replace("width:520px", f"width:{scenario.get('width', 520)}px").replace("monster.png", scenario.get("monster", "monster.png")).replace("WORN_JSON", json.dumps(worn_items(scenario.get("worn", WORN)))).replace("COLLAPSED", json.dumps(collapsed)).replace("SCENARIO_JSON", json.dumps(scenario))


def shoot(url, out):
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run",
                                   "--force-device-scale-factor=2", "--use-mock-keychain", "--password-store=basic", f"--user-data-dir={profile}",
                                   "--virtual-time-budget=8000", "--window-size=1000,620", f"--screenshot={out}", url],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(200):
            if out.exists() and out.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.25)
        chrome.kill()
        chrome.wait()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    for name, collapsed, scenario in SCENARIOS:
        (OUT / f"{name}.html").write_text(page(collapsed, scenario))
        url = f"http://127.0.0.1:{server.server_address[1]}/dev/preview/{name}.html"
        shoot(url, OUT / f"{name}.png")
        print(OUT / f"{name}.png")
    server.shutdown()


if __name__ == "__main__":
    main()
