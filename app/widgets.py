"""Interactive illustrations in notes ("interactive" note blocks).

A block's body is a small, self-contained HTML + JavaScript snippet (Claude writes them).
The notes page shows it in an <iframe sandbox="allow-scripts" srcdoc=...>. With no
allow-same-origin, the snippet runs in an opaque origin: it can't read Homebase's pages,
cookies, storage or API. The page's Content-Security-Policy also blocks all network
access except loading libraries (and their CSS/fonts) from cdn.jsdelivr.net.

The wrapper gives every snippet the Homebase look and a few helpers:
  - CSS variables: --bg --surface --sunken --line --ink --ink-soft --ink-faint
    --accent (the course color) --c201 --c254 --c200 --moss --ochre --brick --plum --slate
  - light/dark follows the app; window.HB.onTheme(fn) re-draws when it changes
  - HB.color(name) reads a variable, for canvas drawing
  - the frame grows to fit the content (up to 900px)
  - KaTeX is available as HB.math(element) for \\( \\) and $$ $$ in the snippet
"""
from markupsafe import Markup, escape

CDN = "https://cdn.jsdelivr.net"

CSP = ("default-src 'none'; "
       f"script-src 'unsafe-inline' {CDN}; style-src 'unsafe-inline' {CDN}; "
       f"font-src {CDN} data:; img-src data: blob:; connect-src 'none'; frame-src 'none'; "
       "form-action 'none'; base-uri 'none'")

STYLE = """
:root { --bg:#f2ece0; --surface:#fbf8f1; --sunken:#ebe4d5; --line:#e2d9c6; --ink:#26251f; --ink-soft:#5d594f;
  --ink-faint:#857f72; --c201:#b06a4a; --c254:#7a8456; --c200:#5b7790; --moss:#6f8a5e; --ochre:#c49a45;
  --brick:#a8553d; --plum:#8a6a86; --slate:#5b7790; --accent:var(--c201); color-scheme: light; }
:root[data-theme="dark"] { --bg:#1a1916; --surface:#23221e; --sunken:#171613; --line:#36332d; --ink:#efe7d6;
  --ink-soft:#bdb4a1; --ink-faint:#8f8777; --c201:#c98466; --c254:#9aa36f; --c200:#7f9bb4; --moss:#8da57a;
  --ochre:#d4ac5c; --brick:#c36d55; --plum:#a888a4; --slate:#7f9bb4; color-scheme: dark; }
:root[data-course="MTH254"] { --accent: var(--c254); } :root[data-course="ECE200"] { --accent: var(--c200); }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; color: var(--ink); }
body { padding: 6px 2px; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
input[type=range] { accent-color: var(--accent); width: 100%; }
button { font: 600 13px system-ui, sans-serif; color: var(--ink); background: var(--surface); border: 1px solid var(--line);
  border-radius: 8px; padding: 5px 11px; cursor: pointer; box-shadow: 0 2px 0 var(--line); }
button:active { transform: translateY(2px); box-shadow: none; }
label { font-size: 13px; color: var(--ink-soft); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.readout { font: 600 14px ui-monospace, Consolas, monospace; color: var(--ink); }
"""

HELPER = """
(function () {
  const root = document.documentElement, fns = [];
  window.HB = {
    color: (n) => getComputedStyle(root).getPropertyValue(n.startsWith('--') ? n : '--' + n).trim(),
    theme: () => root.dataset.theme || 'light',
    onTheme: (fn) => { fns.push(fn); },
    math: (el) => {
      const run = () => window.renderMathInElement && window.renderMathInElement(el || document.body,
        { delimiters: [{ left: '\\\\(', right: '\\\\)', display: false }, { left: '$$', right: '$$', display: true }], throwOnError: false });
      if (window.renderMathInElement) run(); else (HB._math = HB._math || []).push(run);
    },
  };
  addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.hb === 'theme') {
      root.dataset.theme = d.theme; if (d.course) root.dataset.course = d.course;
      fns.forEach((f) => { try { f(d.theme); } catch (err) { console.error(err); } });
    }
  });
  const report = () => {
    const b = document.body; if (!b) return;
    const h = Math.ceil(Math.max(b.scrollHeight, b.getBoundingClientRect().height) + 12);
    parent.postMessage({ hb: 'height', h }, '*');
  };
  addEventListener('DOMContentLoaded', () => { new ResizeObserver(report).observe(document.body); report(); });
  addEventListener('load', () => { report(); setTimeout(report, 300); setTimeout(report, 1200); });
  addEventListener('error', (e) => {
    const box = document.createElement('pre');
    box.style.cssText = 'color:var(--brick);white-space:pre-wrap;font:12px ui-monospace,monospace';
    box.textContent = 'This illustration hit an error: ' + e.message;
    document.body.append(box);
  });
})();
"""

KATEX = (f'<link rel="stylesheet" href="{CDN}/npm/katex@0.16.11/dist/katex.min.css">'
         f'<script defer src="{CDN}/npm/katex@0.16.11/dist/katex.min.js"></script>'
         f'<script defer src="{CDN}/npm/katex@0.16.11/dist/contrib/auto-render.min.js" '
         'onload="(HB._math||[]).forEach(f=>f())"></script>')


def document(body: str) -> str:
    """The full page for one interactive block (goes into the iframe's srcdoc)."""
    return ("<!doctype html><html data-theme=\"light\"><head><meta charset=\"utf-8\">"
            f"<meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\">"
            f"<style>{STYLE}</style><script>{HELPER}</script>{KATEX}</head><body>{body}</body></html>")


def frame(body: str, title: str = "Interactive illustration") -> Markup:
    return Markup(f'<iframe class="nb-widget" sandbox="allow-scripts" loading="lazy" title="{escape(title)}" '
                  f'srcdoc="{escape(document(body))}"></iframe>')
