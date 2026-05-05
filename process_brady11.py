"""
process_brady11.py
─────────────────────────────────────────────────────────────────────────────
Replace speaker-notes system with:
  1. NOTES modal  — draggable floating window, N-key only (no visible button)
  2. Comments     — "+" FAB button, editable footer panel, localStorage auto-save
─────────────────────────────────────────────────────────────────────────────
"""

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    html = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 1. REPLACE THE <style id="speaker-notes-css"> ... </style> BLOCK
# ─────────────────────────────────────────────────────────────────────────────

OLD_STYLE_START = '<style id="speaker-notes-css">'
OLD_STYLE_END   = '</style>\n<script>window.__notesCSS__ = document.getElementById(\'speaker-notes-css\').textContent;</script>'

NEW_CSS = '''\
<style id="speaker-notes-css">
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

/* ── COMMENTS PANEL (editable footer) ──────────────────────────────── */
#comments-panel {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 220px;
  background: rgba(17,25,46,0.98);
  color: #e8eaf0;
  font-family: 'Manrope', sans-serif;
  z-index: 9999;
  transform: translateY(100%);
  transition: transform 0.28s cubic-bezier(.4,0,.2,1);
  border-top: 3px solid #2eb8a6;
  display: flex;
  flex-direction: column;
}
#comments-panel.open { transform: translateY(0); }
#comments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
#comments-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #2eb8a6;
}
#comments-slide-label {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
}
#comments-save-indicator {
  font-size: 10px;
  color: rgba(46,184,166,0.7);
  margin-left: 10px;
  transition: opacity 0.4s;
  opacity: 0;
}
#comments-save-indicator.show { opacity: 1; }
#comments-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  padding: 0 2px;
  transition: color .2s;
  margin-left: 12px;
}
#comments-close:hover { color: #fff; }
#comments-textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: #e8eaf0;
  font-family: 'Manrope', sans-serif;
  font-size: 13.5px;
  line-height: 1.65;
  padding: 10px 20px 12px;
  resize: none;
  outline: none;
}
#comments-textarea::placeholder { color: rgba(255,255,255,0.2); }

/* ── COMMENT FAB "+" button ─────────────────────────────────────────── */
#comments-fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #2eb8a6;
  color: #fff;
  font-size: 22px;
  line-height: 42px;
  text-align: center;
  cursor: pointer;
  z-index: 10000;
  border: none;
  box-shadow: 0 4px 16px rgba(46,184,166,0.45);
  transition: background .2s, transform .15s, box-shadow .2s;
  font-family: sans-serif;
  font-weight: 300;
}
#comments-fab:hover {
  background: #25a393;
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(46,184,166,0.55);
}
#comments-fab.active {
  background: #1a7a6e;
  transform: rotate(45deg) scale(1.05);
}
/* dot indicator when a comment exists for this slide */
#comments-fab::after {
  content: '';
  position: absolute;
  top: 4px; right: 4px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #f5c842;
  border: 1.5px solid rgba(17,25,46,0.8);
  display: none;
}
#comments-fab.has-comment::after { display: block; }
</style>'''

# find and replace
css_start = html.find(OLD_STYLE_START)
css_end   = html.find(OLD_STYLE_END) + len(OLD_STYLE_END)
assert css_start != -1, 'Could not find <style id="speaker-notes-css">'
assert css_end   > css_start, 'Could not find end of CSS block'
html = html[:css_start] + NEW_CSS + html[css_end:]
print('✓ CSS block replaced')

# ─────────────────────────────────────────────────────────────────────────────
# 2. REPLACE THE JS INJECTION (after NOTES dict, from "// inject CSS" onward)
# ─────────────────────────────────────────────────────────────────────────────

OLD_JS_MARKER = '  // inject CSS\n  var style = document.createElement(\'style\');\n  style.textContent = window.__notesCSS__;\n  document.head.appendChild(style);'

NEW_JS = """\
  // ── inject CSS ──────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = document.getElementById('speaker-notes-css').textContent;
  document.head.appendChild(style);

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function getCurrentSlide() {
    var slides = document.querySelectorAll('.slide');
    var best = null, bestDist = Infinity;
    slides.forEach(function(s) {
      var r = s.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top  + r.height / 2;
      var d  = Math.abs(cx - window.innerWidth / 2) + Math.abs(cy - window.innerHeight / 2);
      if (d < bestDist) { bestDist = d; best = s; }
    });
    return best;
  }
  function getSlideNum(slide) {
    if (!slide) return 1;
    var el = slide.querySelector('.slide-num');
    if (!el) return 1;
    var m = el.textContent.match(/(\\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }
  function commentKey(n) { return 'brady_comment_slide_' + n; }

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
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // COMMENTS PANEL  ("+" FAB → editable footer)
  // ══════════════════════════════════════════════════════════════════════════
  var commPanel = document.createElement('div');
  commPanel.id = 'comments-panel';
  commPanel.innerHTML =
    '<div id="comments-header">' +
      '<span id="comments-title">💬 Slide Comment</span>' +
      '<span id="comments-slide-label">Slide 01</span>' +
      '<span id="comments-save-indicator">✓ Saved</span>' +
      '<button id="comments-close" title="Close">✕</button>' +
    '</div>' +
    '<textarea id="comments-textarea" placeholder="Add a comment for this slide… (auto-saved on close)"></textarea>';
  document.body.appendChild(commPanel);

  var fab = document.createElement('button');
  fab.id    = 'comments-fab';
  fab.title = 'Add slide comment';
  fab.textContent = '+';
  document.body.appendChild(fab);

  var commOpen = false;
  var commCurrentSlide = 1;
  var saveTimer;

  function fabDotUpdate(n) {
    var existing = localStorage.getItem(commentKey(n));
    if (existing && existing.trim()) {
      fab.classList.add('has-comment');
    } else {
      fab.classList.remove('has-comment');
    }
  }

  function openComments() {
    var n = getSlideNum(getCurrentSlide());
    commCurrentSlide = n;
    document.getElementById('comments-slide-label').textContent =
      'Slide ' + String(n).padStart(2,'0') + ' / 48';
    var ta = document.getElementById('comments-textarea');
    ta.value = localStorage.getItem(commentKey(n)) || '';
    hideSaveIndicator();
    commPanel.classList.add('open');
    fab.classList.add('active');
    commOpen = true;
    setTimeout(function() { ta.focus(); }, 280);
  }

  function saveComment() {
    var ta = document.getElementById('comments-textarea');
    var val = ta.value;
    if (val.trim()) {
      localStorage.setItem(commentKey(commCurrentSlide), val);
    } else {
      localStorage.removeItem(commentKey(commCurrentSlide));
    }
    showSaveIndicator();
    fabDotUpdate(commCurrentSlide);
  }

  function closeComments() {
    saveComment();
    commPanel.classList.remove('open');
    fab.classList.remove('active');
    commOpen = false;
  }

  function showSaveIndicator() {
    var ind = document.getElementById('comments-save-indicator');
    ind.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function() { ind.classList.remove('show'); }, 1800);
  }
  function hideSaveIndicator() {
    document.getElementById('comments-save-indicator').classList.remove('show');
  }

  // auto-save on textarea input (debounced)
  var autoSaveTimer;
  document.getElementById('comments-textarea').addEventListener('input', function() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function() {
      var ta = document.getElementById('comments-textarea');
      var val = ta.value;
      if (val.trim()) {
        localStorage.setItem(commentKey(commCurrentSlide), val);
      } else {
        localStorage.removeItem(commentKey(commCurrentSlide));
      }
      fabDotUpdate(commCurrentSlide);
      showSaveIndicator();
    }, 800);
  });

  fab.addEventListener('click', function() {
    if (commOpen) closeComments(); else openComments();
  });
  document.getElementById('comments-close').addEventListener('click', closeComments);

  // ══════════════════════════════════════════════════════════════════════════
  // KEYBOARD & SCROLL EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', function(e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'n' || e.key === 'N') toggleNotes();
    if (e.key === 'Escape') { if (notesOpen) closeNotes(); if (commOpen) closeComments(); }
  });

  // update notes content when slide changes
  var scrollTimer;
  function onSlideChange() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      if (notesOpen) notesUpdate();
      // update FAB dot for current slide
      fabDotUpdate(getSlideNum(getCurrentSlide()));
    }, 180);
  }
  window.addEventListener('scroll', onSlideChange, true);
  document.addEventListener('keyup', function(e) {
    if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','PageDown','PageUp'].indexOf(e.key) !== -1) {
      setTimeout(function() {
        if (notesOpen) notesUpdate();
        fabDotUpdate(getSlideNum(getCurrentSlide()));
      }, 120);
    }
  });

  // init FAB dot on load
  setTimeout(function() { fabDotUpdate(1); }, 400);"""

assert html.find(OLD_JS_MARKER) != -1, 'Could not find JS injection marker'
html = html.replace(OLD_JS_MARKER, NEW_JS, 1)
print('✓ JS block replaced')

# ─────────────────────────────────────────────────────────────────────────────
# 3. REMOVE hint.addEventListener('click', toggle); line (old hint wiring)
# ─────────────────────────────────────────────────────────────────────────────
OLD_HINT_WIRE = '\n  hint.addEventListener(\'click\', toggle);\n  document.getElementById(\'notes-close\').addEventListener(\'click\', closeNotes);\n'
if OLD_HINT_WIRE in html:
    html = html.replace(OLD_HINT_WIRE, '\n', 1)
    print('✓ Old hint wiring removed')
else:
    print('  (hint wiring already gone — skipped)')

# ─────────────────────────────────────────────────────────────────────────────
# 4. SAVE
# ─────────────────────────────────────────────────────────────────────────────
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'\n✓ Done. File saved: {SRC}')
