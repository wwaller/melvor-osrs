"""Render Melvor's stylesheets with typical Melvor markup, with and without the OSRS theme, side by side."""
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "build" / ".cache"
OUT = ROOT / "dev" / "preview"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SHEETS = ["assets/css/oneui.css", "assets/css/themes/amethyst.min.css", "assets/css/game.css"]
SKILLS = [("Woodcutting", "99 / 99", True), ("Fishing", "72 / 99", False), ("Firemaking", "85 / 99", False), ("Cooking", "60 / 99", False), ("Mining", "91 / 99", False)]

MARKUP = """
<div id="page-container" class="sidebar-o sidebar-dark enable-page-overlay side-scroll page-header-fixed">
  <nav id="sidebar"><div class="content-header bg-white-5"><span class="font-w600 text-dual">Melvor Idle</span></div>
    <div class="content-side content-side-full"><ul class="nav-main">
      <li class="nav-main-heading">Non-Combat</li>{skills}
      <li class="nav-main-heading">Other</li>
      <li class="nav-main-item"><a class="nav-main-link"><span class="nav-main-link-name">Bank</span><small class="text-muted">412 / 600</small></a></li>
      <li class="nav-main-item"><a class="nav-main-link"><span class="nav-main-link-name">Shop</span></a></li>
    </ul></div></nav>
  <header id="page-header"><div class="content-header"><div><button class="btn btn-sm btn-dual mr-1">Menu</button><span class="font-w600">Woodcutting</span></div>
    <div><span class="badge badge-success">GP 1,204,331</span> <button class="btn btn-sm btn-dual">Settings</button></div></div></header>
  <main id="main-container"><div class="content">
    <div class="row">
      <div class="col-6"><div class="block block-rounded block-link-pop">
        <div class="block-header block-header-default"><h3 class="block-title">Magic Tree</h3><span class="badge badge-info">Mastery 99</span></div>
        <div class="block-content"><p class="font-size-sm text-muted">Chop magic logs for 250 XP every 4.2 seconds.</p>
          <div class="progress active mb-2" style="height:8px"><div class="progress-bar bg-success" style="width:64%"></div></div>
          <div class="progress active mb-3" style="height:8px"><div class="progress-bar bg-info" style="width:38%"></div></div>
          <p><button class="btn btn-primary mr-1">Cut</button><button class="btn btn-success mr-1">Start</button><button class="btn btn-danger mr-1">Stop</button><button class="btn btn-warning mr-1">Upgrade</button><button class="btn btn-secondary">Info</button></p>
        </div></div></div>
      <div class="col-6"><div class="block block-rounded">
        <div class="block-header block-header-default"><h3 class="block-title">Bank</h3></div>
        <div class="block-content"><ul class="nav nav-tabs nav-tabs-block mb-2"><li class="nav-item"><a class="nav-link active">Tab 1</a></li><li class="nav-item"><a class="nav-link">Tab 2</a></li></ul>
          <input class="form-control mb-2" placeholder="Search bank">
          <p><span class="badge badge-primary">Primary</span> <span class="badge badge-warning">Warning</span> <span class="badge badge-danger">Danger</span> <span class="badge badge-secondary">Secondary</span></p>
          <p class="text-success mb-1">+250 Woodcutting XP</p><p class="text-danger mb-1">You have run out of logs.</p><p class="text-warning mb-1">Mastery pool 50% bonus</p><p class="text-info">Golbins approach</p>
        </div></div></div>
    </div>
    <div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">Combat</h3></div>
      <div class="block-content"><div class="progress mb-2" style="height:14px"><div id="combat-player-hitpoints-bar" class="progress-bar bg-danger" style="width:72%">72 / 99</div></div>
      <div class="mb-3" style="position:relative;height:50px">{splashes}</div>
      <div class="mb-3">{stacks}</div>
      <div class="tippy-box mb-3" style="display:inline-block;padding:4px 8px"><div class="tippy-content">Magic logs<br><span class="text-warning">Sells for 1,000 GP</span></div></div>
      <div class="progress mb-3" style="height:14px"><div class="progress-bar bg-warning" style="width:45%"></div></div>
      <table class="table table-sm table-vcenter"><tr><th>Stat</th><th>Value</th></tr><tr><td>Attack</td><td>99</td></tr><tr><td>Strength</td><td>94</td></tr></table></div></div>
    <div class="swal2-popup" style="display:block;width:420px;padding:16px;margin-bottom:20px"><h2 class="swal2-title">Load Local Save</h2>
      <div class="swal2-html-container"><h5 class="text-dark font-size-sm">This will overwrite your cloud save. Are you sure?</h5><h5 class="font-w600 text-danger mb-3 mt-3">WILL OVERWRITE</h5></div></div>
  </div></main>
</div>"""

SKILL_ROW = '<li class="nav-main-item"><a class="nav-main-link{active}"><span class="nav-main-link-name">{name}</span><small class="text-muted">{level}</small></a></li>'


def page(themed):
    links = "".join(f'<link rel="stylesheet" href="{(CACHE / urllib.parse.quote("https://steam.melvoridle.com/" + s, safe="")).as_uri()}">' for s in SHEETS)
    links += f'<link rel="stylesheet" href="{(ROOT / "mod" / "theme.css").as_uri()}">'
    skills = "".join(SKILL_ROW.format(name=n, level=l, active=" active" if a else "") for n, l, a in SKILLS)
    features = " osrs-theme osrs-shadows osrs-bevels osrs-tooltips osrs-hp-bars osrs-texture osrs-stacks osrs-hitsplats" if themed else ""
    images = ROOT / "mod" / "img"
    variables = ";".join(f"--osrs-{name}:url('{(images / f'{file}').as_uri()}')" for name, file in
                         [("stone", "stone.png")] + [(f"hitsplat-{h}", f"hitsplat-{h}.png") for h in ("damage", "max-hit", "zero", "poison", "heal")])
    splashes = "".join(f'<div class="splash-animation {cls}{extra}" style="position:absolute;left:{i * 70}px;animation:none">{n}</div>'
                       for i, (cls, extra, n) in enumerate([("text-splash-attack", "", 14), ("text-crit", "", 32), ("text-splash-attack", " osrs-zero", 0), ("text-poison", "", 6), ("text-success", "", 20)]))
    stacks = "".join(f'<span class="btn btn-light mr-1" style="position:relative;width:60px;height:48px"><small data-osrs-stack="{colour}" style="position:absolute;left:4px;top:2px">{text}</small></span>'
                     for text, colour in [("65535", "yellow"), ("2500K", "white"), ("12M", "green")] if themed) if themed else ""
    body = MARKUP.format(skills=skills, splashes=splashes, stacks=stacks)
    return f'<!doctype html><html style="{variables}"><head><meta charset="utf-8">{links}</head><body class="darkMode{features}">{body}</body></html>'


LOGIN_MARKUP = """
<div style="display:flex;justify-content:flex-end;padding:30px 60px">
  <div style="width:900px">
    <h1 class="text-center" style="color:#fff">Select your Character</h1>
    <div class="btn-group w-100 mb-3"><button class="btn btn-lg btn-alt-primary character-selection-toggle w-100">Show Cloud Saves</button></div>
    <save-slot-display><div class="block block-rounded p-1 mb-3"><div class="block-header p-2"><h3 class="block-title">Save Slot #1</h3></div>
      <div class="block-content p-0"><div class="btn-group w-100"><button class="btn btn-lg" style="width:100%">
        <div class="media d-flex align-items-center"><div class="media-body text-left"><h5 class="font-w600 mb-1 font-size-sm text-warning">Local Save</h5><h5 class="font-w600 mb-2 text-white">Garu Garu</h5></div>
        <div class="ml-1 text-right"><h5 class="font-size-xs mb-0 text-white">832 Total Level</h5></div></div>
        <h5 class="mt-2 mb-0 font-w600 font-size-sm p-1 bg-success rounded">Most recent save</h5></button></div></div></div></save-slot-display>
    <save-slot-display><div class="block block-rounded p-1 mb-3"><div class="block-header p-2"><h3 class="block-title">Save Slot #2</h3></div>
      <div class="block-content p-0"><div class="btn-group w-100"><button class="btn btn-lg btn-outline-success w-80" style="width:100%">
        <h5 class="font-w600 mb-0 font-size-sm text-left py-3">Click to create a new Character</h5></button></div></div></div></save-slot-display>
  </div>
</div>"""


def login_page():
    links = "".join(f'<link rel="stylesheet" href="{(CACHE / urllib.parse.quote("https://steam.melvoridle.com/" + s, safe="")).as_uri()}">' for s in SHEETS)
    links += f'<link rel="stylesheet" href="{(ROOT / "mod" / "theme.css").as_uri()}">'
    images = ROOT / "mod" / "img"
    variables = ";".join(f"--osrs-{name}:url('{(images / file).as_uri()}')" for name, file in [("login", "login.jpg"), ("titlebox", "titlebox.png"), ("titlebutton", "titlebutton.png"), ("stone", "stone.png")])
    script = f'<script type="module">import {{ createLoginScene }} from "{(ROOT / "mod" / "fire.mjs").as_uri()}"; createLoginScene(document, window).show();</script>'
    classes = "darkMode osrs-theme osrs-shadows osrs-bevels osrs-login osrs-cards osrs-character-select"
    return f'<!doctype html><html style="{variables}"><head><meta charset="utf-8">{links}</head><body class="{classes}">{LOGIN_MARKUP}{script}</body></html>'


def shoot(html, out, size="1200,1100"):
    path = OUT / f"{out.stem}.html"
    path.write_text(html)
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                                   "--use-mock-keychain", "--password-store=basic", "--allow-file-access-from-files", f"--user-data-dir={profile}",
                                   "--virtual-time-budget=3000", f"--window-size={size}", f"--screenshot={out}", path.as_uri()],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(120):
            if out.exists() and out.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.25)
        chrome.kill()
        chrome.wait()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    before, after = OUT / "melvor.png", OUT / "osrs.png"
    shoot(page(False), before)
    shoot(page(True), after)
    left, right = Image.open(before), Image.open(after)
    scale = 0.5 if "--small" in sys.argv else 1
    combined = Image.new("RGB", (left.width + right.width, left.height))
    combined.paste(left, (0, 0))
    combined.paste(right, (left.width, 0))
    if scale != 1:
        combined = combined.resize((int(combined.width * scale), int(combined.height * scale)))
    combined.save(OUT / "side_by_side.png")
    shoot(login_page(), OUT / "login.png", "1600,900")
    print(OUT / "side_by_side.png")


if __name__ == "__main__":
    main()
