"""
process_brady12.py
─────────────────────────────────────────────────────────────────────────────
Replace in-page notes modal with a standalone popup window:
  • N key  → window.open() a fresh browser window, sized for second screen
  • postMessage passes slide number + text on every slide change
  • Popup auto-syncs; main deck has zero visible UI for notes
  • Comments "+" FAB system unchanged
─────────────────────────────────────────────────────────────────────────────
"""

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    html = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 1. STRIP MODAL CSS from the style block (keep Comments CSS intact)
# ─────────────────────────────────────────────────────────────────────────────
OLD_MODAL_CSS = """\
/* ── NOTES MODAL (draggable, N-key only) ────────────────────────────── */
#notes-modal {
  position: fixed;
  width: 520px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 70vh;
  background: rgba(14,20,42,0.97);
  color: #e8eaf0;
  font-family: 'Manrope', sans-serif;
  font-size: 13.5px;
  line-height: 1.7;
  border-radius: 12px;
  border: 1px solid rgba(94,63,190,0.6);
  box-shadow: 0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* start hidden */
  opacity: 0;
  pointer-events: none;
  transform: scale(0.95) translateY(8px);
  transition: opacity 0.22s ease, transform 0.22s ease;
  /* default position — bottom-right quarter */
  bottom: 72px;
  right: 24px;
}
#notes-modal.open {
  opacity: 1;
  pointer-events: all;
  transform: scale(1) translateY(0);
}
#notes-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  cursor: grab;
  background: rgba(94,63,190,0.15);
  flex-shrink: 0;
  user-select: none;
}
#notes-modal-header:active { cursor: grabbing; }
#notes-modal-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9b7ff5;
}
#notes-modal-slide {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  margin-left: auto;
  margin-right: 12px;
}
#notes-modal-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  padding: 0 2px;
  transition: color .2s;
  flex-shrink: 0;
}
#notes-modal-close:hover { color: #fff; }
#notes-modal-body {
  overflow-y: auto;
  padding: 14px 20px 16px;
  flex: 1;
}
#notes-modal-body p { margin: 0 0 0.85em; }
#notes-modal-body p:last-child { margin-bottom: 0; }
/* resize handle */
#notes-modal-resize {
  position: absolute;
  bottom: 0; right: 0;
  width: 18px; height: 18px;
  cursor: se-resize;
  opacity: 0.3;
}
#notes-modal-resize:hover { opacity: 0.7; }
"""

assert OLD_MODAL_CSS in html, 'Modal CSS block not found'
html = html.replace(OLD_MODAL_CSS, '', 1)
print('✓ Modal CSS removed')

# ─────────────────────────────────────────────────────────────────────────────
# 2. REPLACE JS NOTES MODAL SECTION with popup window code
# ─────────────────────────────────────────────────────────────────────────────
OLD_NOTES_JS = """\
  // ══════════════════════════════════════════════════════════════════════════
  // NOTES MODAL  (N key — no visible button)
  // ══════════════════════════════════════════════════════════════════════════
  var modal = document.createElement('div');
  modal.id = 'notes-modal';
  modal.innerHTML =
    '<div id="notes-modal-header">' +
      '<span id="notes-modal-title">📋 Speaker Notes</span>' +
      '<span id="notes-modal-slide">Slide 01 / 48</span>' +
      '<button id="notes-modal-close" title="Close (N)">✕</button>' +
    '</div>' +
    '<div id="notes-modal-body"></div>' +
    '<svg id="notes-modal-resize" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M15 3L3 15M15 9L9 15M15 15H15.01" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';
  document.body.appendChild(modal);

  var notesOpen = false;

  function notesUpdate() {
    var n = getSlideNum(getCurrentSlide());
    var text = NOTES[n] || 'No notes for this slide.';
    document.getElementById('notes-modal-slide').textContent =
      'Slide ' + String(n).padStart(2,'0') + ' / 48';
    var body = document.getElementById('notes-modal-body');
    var paras = text.split(/\\n\\n+/);
    body.innerHTML = paras.map(function(p) {
      return '<p>' + p.trim().replace(/\\n/g,'<br>') + '</p>';
    }).join('');
  }

  function openNotes() {
    notesUpdate();
    modal.classList.add('open');
    notesOpen = true;
  }
  function closeNotes() {
    modal.classList.remove('open');
    notesOpen = false;
  }
  function toggleNotes() { if (notesOpen) closeNotes(); else openNotes(); }

  document.getElementById('notes-modal-close').addEventListener('click', closeNotes);

  // ── Draggable modal ──────────────────────────────────────────────────────
  (function() {
    var hdr = document.getElementById('notes-modal-header');
    var dragging = false, ox = 0, oy = 0, startR = 0, startB = 0;
    hdr.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      dragging = true;
      ox = e.clientX;
      oy = e.clientY;
      var rect = modal.getBoundingClientRect();
      // switch from bottom/right anchoring to top/left for free dragging
      modal.style.top  = rect.top  + 'px';
      modal.style.left = rect.left + 'px';
      modal.style.bottom = 'auto';
      modal.style.right  = 'auto';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var dx = e.clientX - ox, dy = e.clientY - oy;
      ox = e.clientX; oy = e.clientY;
      var t = parseInt(modal.style.top)  || 0;
      var l = parseInt(modal.style.left) || 0;
      modal.style.top  = Math.max(0, t + dy) + 'px';
      modal.style.left = Math.max(0, l + dx) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
  })();

  // ── Resize handle ────────────────────────────────────────────────────────
  (function() {
    var rz = document.getElementById('notes-modal-resize');
    var resizing = false, startW = 0, startH = 0, startX = 0, startY = 0;
    rz.addEventListener('mousedown', function(e) {
      resizing = true;
      startW = modal.offsetWidth;
      startH = modal.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!resizing) return;
      var w = Math.max(320, startW + (e.clientX - startX));
      var h = Math.max(200, startH + (e.clientY - startY));
      modal.style.width  = w + 'px';
      modal.style.height = h + 'px';
      modal.style.maxHeight = 'none';
    });
    document.addEventListener('mouseup', function() { resizing = false; });
  })();\
"""

# The popup window HTML — written via document.write into the new window
# Using triple-escaped sequences because this goes:
#   Python string → JS string (in single-quotes) → document.write HTML → browser
POPUP_JS = """\
  // ══════════════════════════════════════════════════════════════════════════
  // NOTES POPUP WINDOW  (N key — opens a real separate browser window)
  // ══════════════════════════════════════════════════════════════════════════
  var notesWin = null;

  var POPUP_HTML = [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<title>Speaker Notes — Brady Hotels × April 2026</title>',
    '<style>',
    '  *{margin:0;padding:0;box-sizing:border-box}',
    '  html,body{height:100%;background:#0b1022;color:#e8eaf0;',
    '    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}',
    '  #header{',
    '    display:flex;align-items:center;gap:12px;',
    '    padding:10px 20px 9px;',
    '    background:rgba(94,63,190,0.18);',
    '    border-bottom:2px solid #5e3fbe;',
    '    flex-shrink:0',
    '  }',
    '  #slide-badge{',
    '    background:#5e3fbe;color:#fff;',
    '    font-size:11px;font-weight:700;letter-spacing:.06em;',
    '    padding:3px 10px;border-radius:20px;white-space:nowrap',
    '  }',
    '  #slide-title{',
    '    font-size:12px;font-weight:600;color:rgba(255,255,255,.55);',
    '    flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
    '  }',
    '  #conn-dot{',
    '    width:8px;height:8px;border-radius:50%;',
    '    background:#2eb8a6;flex-shrink:0;',
    '    box-shadow:0 0 6px #2eb8a6',
    '  }',
    '  #conn-dot.waiting{background:#555;box-shadow:none}',
    '  #body-wrap{',
    '    height:calc(100vh - 44px);overflow-y:auto;',
    '    padding:22px 28px 28px',
    '  }',
    '  #waiting{',
    '    text-align:center;padding-top:80px;',
    '    color:rgba(255,255,255,.25);font-size:14px',
    '  }',
    '  #waiting svg{display:block;margin:0 auto 16px;opacity:.2}',
    '  #script-wrap{display:none}',
    '  .para{',
    '    font-size:15px;line-height:1.75;',
    '    color:#dde1f0;margin-bottom:1.1em',
    '  }',
    '  .para:last-child{margin-bottom:0}',
    '  .para b{color:#fff}',
    '  /* scrollbar */',
    '  #body-wrap::-webkit-scrollbar{width:5px}',
    '  #body-wrap::-webkit-scrollbar-track{background:transparent}',
    '  #body-wrap::-webkit-scrollbar-thumb{background:#2a2f4a;border-radius:4px}',
    '  /* slide-in animation */',
    '  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '  .animate{animation:fadeUp .25s ease both}',
    '</style>',
    '</head><body>',
    '<div id="header">',
    '  <div id="slide-badge">Slide — / 48</div>',
    '  <div id="slide-title">Waiting for presentation…</div>',
    '  <div id="conn-dot" class="waiting" title="Synced with deck"></div>',
    '</div>',
    '<div id="body-wrap">',
    '  <div id="waiting">',
    '    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">',
    '      <circle cx="24" cy="24" r="20" stroke="white" stroke-width="2.5"/>',
    '      <path d="M24 14v10l6 6" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
    '    </svg>',
    '    Switch to the next slide to sync speaker notes.',
    '  </div>',
    '  <div id="script-wrap"></div>',
    '</div>',
    '<script>',
    '  window.addEventListener("message",function(e){',
    '    if(!e.data||e.data.type!=="notes-slide")return;',
    '    var n=e.data.n, text=e.data.text||"";',
    '    document.getElementById("slide-badge").textContent=',
    '      "Slide "+String(n).padStart(2,"0")+" / 48";',
    '    document.getElementById("slide-title").textContent=e.data.title||"";',
    '    document.getElementById("conn-dot").classList.remove("waiting");',
    '    document.getElementById("waiting").style.display="none";',
    '    var wrap=document.getElementById("script-wrap");',
    '    wrap.style.display="block";',
    '    var paras=text.split(/\\\\n\\\\n+/);',
    '    wrap.innerHTML=paras.map(function(p){',
    '      return "<div class=\\"para animate\\">"+p.trim().replace(/\\\\n/g,"<br>")+"</div>";',
    '    }).join("");',
    '    document.getElementById("body-wrap").scrollTop=0;',
    '  });',
    '<\\/script>',
    '</body></html>'
  ].join('\\n');

  function notesOpen() { return notesWin && !notesWin.closed; }

  function notesUpdate() {
    if (!notesOpen()) return;
    var n    = getSlideNum(getCurrentSlide());
    var text = NOTES[n] || 'No notes for this slide.';
    notesWin.postMessage({ type: 'notes-slide', n: n, text: text, title: '' }, '*');
  }

  function openNotesWindow() {
    var features = 'width=820,height=640,resizable=yes,scrollbars=yes,' +
                   'menubar=no,toolbar=no,location=no,status=no';
    notesWin = window.open('', 'brady_speaker_notes', features);
    if (!notesWin) {
      alert('Popup blocked! Please allow popups for this page, then press N again.');
      return;
    }
    notesWin.document.open();
    notesWin.document.write(POPUP_HTML);
    notesWin.document.close();
    // send current slide after a short paint delay
    setTimeout(notesUpdate, 350);
  }

  function toggleNotes() {
    if (notesOpen()) {
      notesWin.close();
    } else {
      openNotesWindow();
    }
  }\
"""

assert OLD_NOTES_JS in html, 'Notes modal JS block not found — check exact whitespace'
html = html.replace(OLD_NOTES_JS, POPUP_JS, 1)
print('✓ Notes modal JS → popup window JS')

# ─────────────────────────────────────────────────────────────────────────────
# 3. FIX KEYBOARD HANDLER — remove closeNotes() ref (popup uses notesWin.close)
#    and update Escape handler
# ─────────────────────────────────────────────────────────────────────────────
OLD_KBD = "    if (e.key === 'n' || e.key === 'N') toggleNotes();\n    if (e.key === 'Escape') { if (notesOpen) closeNotes(); if (commOpen) closeComments(); }"
NEW_KBD = "    if (e.key === 'n' || e.key === 'N') toggleNotes();\n    if (e.key === 'Escape') { if (commOpen) closeComments(); }"
assert OLD_KBD in html, 'Keyboard handler not found'
html = html.replace(OLD_KBD, NEW_KBD, 1)
print('✓ Keyboard handler updated')

# ─────────────────────────────────────────────────────────────────────────────
# 4. FIX SCROLL/ARROW HANDLERS — replace `if (notesOpen) notesUpdate()` refs
# ─────────────────────────────────────────────────────────────────────────────
OLD_SCROLL = "      if (notesOpen) notesUpdate();"
NEW_SCROLL = "      notesUpdate();"
count = html.count(OLD_SCROLL)
html = html.replace(OLD_SCROLL, NEW_SCROLL)
print(f'✓ Scroll/arrow handlers updated ({count} occurrences)')

# ─────────────────────────────────────────────────────────────────────────────
# 5. SAVE
# ─────────────────────────────────────────────────────────────────────────────
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'\n✓ Done. Saved: {SRC}')
