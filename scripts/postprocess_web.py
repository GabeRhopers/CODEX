#!/usr/bin/env python3
"""Turns the raw Emscripten build output (bin/index.html + thextech.js/.wasm/.data)
into the final deployable page.

Why this exists: TheXTech's own native main menu requires an "intro" level plus
several pixel-exact legacy bitmap-font atlases (undocumented outside the engine's
C++ source) to render correctly, and it spawns multiple wandering "attract mode"
players by default. That's a lot of fragile, hard-to-verify surface for a menu
whose only real jobs here are "show the title" and "let the player click Play" -
jobs an ordinary web page does more reliably and with actual design control.

This script instead:
  - launches straight into the single playable level (Module.arguments), skipping
    MENU_INTRO/MENU_MAIN and the intro-level/menu-font requirements entirely
  - replaces the default Emscripten shell UI with a real HTML/CSS title screen
  - wires the title screen's Play button to satisfy the engine's own click-to-start
    gate (it polls live mouse-button state each frame, so the button handler holds
    a synthetic mousedown briefly before releasing it) as well as the browser's
    autoplay-unlock gesture requirement
"""
import re
import sys
from pathlib import Path

LEVEL_PATH = "worlds/dream-world/level1.lvlx"
PAGE_TITLE = "Grampa's Dream Quest"

TITLE_SCREEN_CSS = """
html, body { height: 100%; margin: 0; background: #0e0a22; overflow: hidden; }
#canvas { display: block; margin: 0 auto; background: #000; outline: none; }
#gdq-title {
  position: fixed; inset: 0; z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.1rem;
  background: radial-gradient(ellipse at 50% 30%, #241a4d 0%, #140f30 55%, #0a0720 100%);
  color: #f3efff; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  text-align: center; padding: 1.5rem; box-sizing: border-box;
  transition: opacity .5s ease; opacity: 1;
}
#gdq-title.gdq-hidden { opacity: 0; pointer-events: none; }
#gdq-title h1 {
  margin: 0; font-size: clamp(2rem, 6vw, 3.4rem); font-weight: 800; letter-spacing: .02em;
  color: #fff; text-shadow: 0 0 24px rgba(160,140,255,.55), 0 2px 0 #241a4d;
}
#gdq-title h1 span { color: #ffd678; }
#gdq-title p.gdq-sub {
  margin: 0; font-size: clamp(.85rem, 2vw, 1.05rem); color: #cabfff; opacity: .85;
  letter-spacing: .03em;
}
#gdq-play {
  margin-top: .6rem; padding: .85rem 2.6rem; font-size: 1.15rem; font-weight: 700;
  color: #201640; background: linear-gradient(180deg, #ffe5a3, #ffc85c);
  border: none; border-radius: 999px; cursor: pointer;
  box-shadow: 0 6px 0 #b8873a, 0 10px 24px rgba(0,0,0,.35);
  transition: transform .12s ease, box-shadow .12s ease;
}
#gdq-play:hover { transform: translateY(-2px); box-shadow: 0 8px 0 #b8873a, 0 14px 28px rgba(0,0,0,.4); }
#gdq-play:active { transform: translateY(3px); box-shadow: 0 3px 0 #b8873a, 0 6px 14px rgba(0,0,0,.35); }
#gdq-play:disabled { opacity: .55; cursor: default; transform: none; box-shadow: 0 6px 0 #b8873a; }
#gdq-status { min-height: 1.3rem; font-size: .85rem; color: #a89bd8; }
#gdq-credits { margin-top: .4rem; font-size: .72rem; color: #7c72a8; max-width: 30rem; line-height: 1.5; }
#gdq-moon {
  width: 3.2rem; height: 3.2rem; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff8dc, #ffe9a8 60%, #d8b96a 100%);
  box-shadow: 0 0 40px rgba(255, 230, 170, .5);
  margin-bottom: .2rem;
}
"""

TITLE_SCREEN_HTML = """
<div id="gdq-title">
  <div id="gdq-moon"></div>
  <h1>GRAMPA'S <span>DREAM QUEST</span></h1>
  <p class="gdq-sub">an original TheXTech episode</p>
  <button id="gdq-play" disabled>Loading&hellip;</button>
  <div id="gdq-status"></div>
  <div id="gdq-credits">
    Built on the open-source TheXTech engine (GPLv3). All characters,
    art, and levels in Grampa's Dream Quest are original works created
    for this project.
  </div>
</div>
"""

TITLE_SCREEN_JS = """
(function () {
  var btn = document.getElementById('gdq-play');
  var overlay = document.getElementById('gdq-title');
  var statusEl = document.getElementById('gdq-status');
  var canvas = document.getElementById('canvas');
  var launched = false;

  // TheXTech's Emscripten window init (WindowSDL::init) unconditionally calls
  // emscripten_enter_soft_fullscreen(), which walks up from the canvas and
  // force-hides every sibling element in <body> (see hideEverythingExceptGivenElement
  // in the generated JS) so the canvas fills the viewport. That stomps on our
  // overlay's display style the moment the engine's window is created, so we
  // keep re-asserting visibility until the player actually launches.
  var reshow = setInterval(function () {
    if (launched) { clearInterval(reshow); return; }
    if (overlay.style.display === 'none') overlay.style.display = '';
  }, 50);

  function reflectStatus() {
    var text = (typeof Module !== 'undefined' && Module.setStatus && Module.setStatus.last)
      ? Module.setStatus.last.text : '';
    if (text && !/all downloads complete/i.test(text)) {
      statusEl.textContent = text;
    } else {
      statusEl.textContent = '';
      btn.disabled = false;
      btn.textContent = 'Play';
    }
    requestAnimationFrame(reflectStatus);
  }
  requestAnimationFrame(reflectStatus);

  function fireMouseEvent(type) {
    var rect = canvas.getBoundingClientRect();
    var evt = new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    });
    canvas.dispatchEvent(evt);
  }

  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    launched = true;
    overlay.classList.add('gdq-hidden');
    overlay.style.display = 'none';
    canvas.focus();
    // The engine polls live mouse-button state each frame rather than a
    // discrete click event, so hold the synthetic press briefly.
    fireMouseEvent('mousedown');
    setTimeout(function () { fireMouseEvent('mouseup'); }, 180);
  });
})();
"""


SW_UNREGISTER_SNIPPET = (
    '<script>"serviceWorker"in navigator&&navigator.serviceWorker.getRegistrations()'
    ".then(rs=>rs.forEach(r=>r.unregister()));"
    '"caches"in window&&caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))</script>'
)


def process(src: Path, dst: Path) -> None:
    html = src.read_text(encoding="utf-8")

    # The default shell registers a service worker (sw.js) for offline/PWA support.
    # Its own cache-first strategy plus an explicit "do NOT claim clients; wait for
    # the old service worker to die naturally" design means a normal reload after a
    # new deploy can keep serving a stale cached build indefinitely - the new SW only
    # takes over once every tab using the old one has been fully closed. That's a bad
    # tradeoff while this project is iterating on every push, so instead of
    # registering sw.js we actively unregister any previously-installed one and clear
    # its caches, so browsers that got stuck on an old deploy self-heal.
    html, n = re.subn(
        r'<script>"serviceWorker"in navigator[^<]*</script>',
        SW_UNREGISTER_SNIPPET,
        html,
        count=1,
    )
    if n != 1:
        raise SystemExit("failed to replace service worker registration - shell markup may have changed")

    # The shell template hardcodes <title>TheXTech Engine</title> with no CMake
    # flag to override it (unlike THEXTECH_MANIFEST_NAME/ID/DESC, which the build
    # is already configured with for the PWA manifest) - fix it here too.
    html, n = re.subn(r"<title>[^<]*</title>", f"<title>{PAGE_TITLE}</title>", html, count=1)
    if n != 1:
        raise SystemExit("failed to rewrite <title> - shell markup may have changed")

    # Launch straight into the level, skipping the native menu entirely.
    html = html.replace(
        "Module={",
        'Module={arguments:["%s"],' % LEVEL_PATH,
        1,
    )

    if 'Module={arguments:["%s"]' % LEVEL_PATH not in html:
        raise SystemExit("failed to inject Module.arguments - shell markup may have changed")

    html = html.replace("</style>", TITLE_SCREEN_CSS + "</style>", 1)
    html = html.replace("<body>", "<body>" + TITLE_SCREEN_HTML, 1)
    html = re.sub(
        r"(<script async src=thextech\.js></script>)",
        r"\1<script>" + TITLE_SCREEN_JS + "</script>",
        html,
        count=1,
    )
    if "gdq-title" not in html or "gdq-play" not in html:
        raise SystemExit("failed to inject title screen markup")

    dst.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    bin_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "TheXTech/build-web/output/bin")
    process(bin_dir / "index.html", bin_dir / "index.html")
    print(f"Post-processed {bin_dir / 'index.html'}: direct-level launch + custom title screen.")
