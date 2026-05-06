"""Replace legacy html2canvas+jsPDF #pdf handler with native browser print
across all deck HTML files. Run from repo root."""
import re
import pathlib

LEGACY_DECKS = [
    "public/slides/brady-april-2026.html",
    "public/slides/brady-april-2026-full.html",
    "public/slides/brady-april-2026-highlevel.html",
    "public/slides/brady-creative-refresh-april-2026.html",
    "public/slides/brady-elizabeth-launch.html",
    "public/slides/brady-wip-april-2026.html",
]

NEW_HANDLER = r"""  // === AUTO-PDF MODE (native browser print) ===
  if (window.location.hash === '#pdf' || window.location.hash === '#print') {
    var triggerPrint = async function () {
      document.querySelectorAll('.slide').forEach(function (s) { s.classList.add('visible'); });
      document.body.classList.add('pdf-mode');
      try { await document.fonts.ready; } catch (e) {}
      var allImgs = Array.prototype.slice.call(document.querySelectorAll('img'));
      await Promise.all(allImgs.map(function (img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(function (resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 4000);
        });
      }));
      document.querySelectorAll('.slide').forEach(function (s) { void s.offsetWidth; });
      await new Promise(function (r) { setTimeout(r, 600); });
      var origTitle = document.title;
      var clean = (origTitle || 'slides')
        .replace(/×/g, 'x').replace(/[—–]/g, '-').replace(/[·•]/g, '-')
        .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
      document.title = clean || 'slides';
      try { window.print(); } catch (e) { console.error('[print]', e); }
      var afterPrint = function () {
        document.title = origTitle;
        window.removeEventListener('afterprint', afterPrint);
        setTimeout(function () { try { window.close(); } catch (e) {} }, 400);
      };
      window.addEventListener('afterprint', afterPrint);
      setTimeout(function () { document.title = origTitle; }, 60000);
    };
    if (document.readyState === 'complete') { triggerPrint(); }
    else { window.addEventListener('load', triggerPrint); }
  }
"""

PDF_BLOCK_RE = re.compile(
    r"  // === AUTO-PDF MODE ===\n"
    r"(?:.*?\n){1,5}?"
    r"  if \(window\.location\.hash === '#pdf'.*?\n"
    r".*?"
    r"\n  \}\n",
    re.DOTALL,
)

JSPDF_TAG_RE = re.compile(
    r'\s*<script src="https://cdnjs\.cloudflare\.com/ajax/libs/jspdf/[^"]+"></script>'
)

for f in LEGACY_DECKS:
    p = pathlib.Path(f)
    src = p.read_text(encoding="utf-8")
    orig = src
    src, n_pdf = PDF_BLOCK_RE.subn(lambda m: NEW_HANDLER, src)
    src, n_jspdf = JSPDF_TAG_RE.subn("", src)
    if src != orig:
        p.write_text(src, encoding="utf-8")
        print(f"  {f}  pdf-handler={n_pdf}  jspdf-tag={n_jspdf}")
    else:
        print(f"  {f}  NO CHANGE  (pdf={n_pdf} jspdf={n_jspdf})")
