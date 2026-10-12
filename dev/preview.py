"""Run setup.mjs on a mock Melvor quick equip tooltip in headless Chrome and screenshot it."""
import functools
import http.server
import json
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT.parent / "melvor-osrs-sprites" / "mod" / "sprites" / "sprite"
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HELMETS = ["Rune_full_helm", "Dragon_full_helm", "Adamant_full_helm", "Mithril_full_helm", "Black_full_helm", "Steel_full_helm", "Iron_full_helm",
           "Bronze_full_helm", "Coif", "Leather_cowl", "Archer_helm", "Berserker_helm", "Farseer_helm", "Slayer_helmet", "Wizard_hat", "Blue_wizard_hat"]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/oneui.css"><link rel="stylesheet" href="https://steam.melvoridle.com/assets/css/game.css">
<style>body{background:#1f2329;padding:24px} .tip{background:#333;border-radius:4px;display:inline-block;padding:6px}</style></head><body class="darkMode">
<div class="tip"><quick-equip-tooltip id="tooltip"><div class="text-center font-size-xs">Quick Equip
  <ul class="nav-main nav-main-horizontal nav-main-horizontal-override font-w400 font-size-sm" id="button-container">
    <div class="btn-group-vertical m-1"><button class="btn btn-sm">a</button></div>
    <div class="btn-group-vertical m-1"><button class="btn btn-sm btn-outline-danger" id="unequip-button">X</button></div>
  </ul></div></quick-equip-tooltip></div>
<script type="module">
const HELMETS = HELMETS_JSON;
const item = (name, locked) => ({ name: name.replace(/_/g, " "), media: "/sprites/item_" + name + ".png", equipRequirements: locked ? ["x"] : [], fitsInSlot: (id) => id === "melvorD:Helmet" });
window.QuickEquipTooltipElement = class QuickEquipTooltipElement { setEquipped() {} };
window.tippy = () => ({ destroy() {} });
window.formatNumber = (n) => n.toLocaleString("en-US");
const slot = { id: "melvorD:Helmet", allowQuantity: false };
const equipped = { slot, isEmpty: false, item: item(HELMETS[0]), quantity: 1 };
const player = { selectedEquipmentSet: 0, equipment: { equippedItems: { "melvorD:Helmet": equipped } }, unequipCallback: () => () => {}, equipItem() {} };
window.game = { combat: { player }, bank: { itemsByTab: [HELMETS.slice(1).map((name, i) => ({ item: item(name, i > 10), quantity: 1 }))] }, checkRequirements: (r) => r.length === 0 };
let patched;
const ctx = { loadStylesheet: (p) => document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="/mod/${p}">`), patch: () => ({ replace: (fn) => (patched = fn) }) };
const { setup } = await import("/mod/setup.mjs");
setup(ctx);
const host = document.getElementById("tooltip");
const tooltip = { buttons: [{ equip: host.querySelector(".btn") }], unequipButton: host.querySelector("#unequip-button"), buttonContainer: host.querySelector("#button-container") };
patched.call(tooltip, () => {}, player, equipped);
</script></body></html>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/sprites/"):
            return str(SPRITES / path[len("/sprites/"):])
        return str(ROOT / path.lstrip("/").split("?", 1)[0])

    def log_message(self, *args):
        pass


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (ROOT / "dev" / "preview" / "index.html").write_text(PAGE.replace("HELMETS_JSON", json.dumps(HELMETS)))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    shot = OUT / "quick-equip.png"
    shot.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([CHROME, "--headless=new", "--hide-scrollbars", "--no-first-run", "--force-device-scale-factor=2", "--use-mock-keychain",
                                   f"--user-data-dir={profile}", "--virtual-time-budget=6000", "--window-size=420,420", f"--screenshot={shot}",
                                   f"http://127.0.0.1:{server.server_address[1]}/dev/preview/index.html"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(120):
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
