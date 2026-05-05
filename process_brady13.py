"""
process_brady13.py
─────────────────────────────────────────────────────────────────────────────
Fix speaker notes popup sync:
  • Replace unreliable postMessage-only approach with:
    1. Opener callback  – popup calls window.opener.bradySendNotes() when ready
    2. localStorage     – main writes brady_slide_data on every slide change
    3. storage event    – popup listens and updates immediately (no timing issue)
  • postMessage kept as a tertiary path for same-document refreshes
─────────────────────────────────────────────────────────────────────────────
"""

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    html = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# Replace the entire POPUP_HTML var + notes functions block
# ─────────────────────────────────────────────────────────────────────────────

OLD_BLOCK = """\
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
    '    var paras=text.split(/\\n\\n+/);',
    '    wrap.innerHTML=paras.map(function(p){',
    '      return "<div class=\\"para animate\\">"+p.trim().replace(/\\n/g,"<br>")+"</div>";',
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

NEW_BLOCK = """\
  // ── Notes popup: build HTML once ────────────────────────────────────────
  // The popup uses THREE sync channels (most reliable first):
  //  1. Opener callback – popup calls window.opener.bradySendNotes() when ready
  //  2. localStorage   – main writes 'brady_slide_data' on every slide change
  //  3. storage event  – popup listens and updates immediately
  var POPUP_HTML = (function() {
    var css = [
      '*{margin:0;padding:0;box-sizing:border-box}',
      'html,body{height:100%;background:#0b1022;color:#e8eaf0;',
      '  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}',
      '#header{display:flex;align-items:center;gap:12px;padding:10px 20px 9px;',
      '  background:rgba(94,63,190,0.18);border-bottom:2px solid #5e3fbe;flex-shrink:0}',
      '#slide-badge{background:#5e3fbe;color:#fff;font-size:11px;font-weight:700;',
      '  letter-spacing:.06em;padding:3px 10px;border-radius:20px;white-space:nowrap}',
      '#slide-title{font-size:12px;font-weight:600;color:rgba(255,255,255,.55);',
      '  flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#conn-dot{width:8px;height:8px;border-radius:50%;background:#2eb8a6;',
      '  flex-shrink:0;box-shadow:0 0 6px #2eb8a6}',
      '#conn-dot.waiting{background:#555;box-shadow:none}',
      '#body-wrap{height:calc(100vh - 44px);overflow-y:auto;padding:22px 28px 28px}',
      '#waiting{text-align:center;padding-top:80px;color:rgba(255,255,255,.25);font-size:14px}',
      '#waiting svg{display:block;margin:0 auto 16px;opacity:.2}',
      '#script-wrap{display:none}',
      '.para{font-size:15px;line-height:1.75;color:#dde1f0;margin-bottom:1.1em}',
      '.para:last-child{margin-bottom:0}',
      '#body-wrap::-webkit-scrollbar{width:5px}',
      '#body-wrap::-webkit-scrollbar-track{background:transparent}',
      '#body-wrap::-webkit-scrollbar-thumb{background:#2a2f4a;border-radius:4px}',
      '@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '.animate{animation:fadeUp .25s ease both}'
    ].join('');

    // Popup JS — runs inside the new window.
    // Uses window.opener.NOTES directly (same-origin) + localStorage for updates.
    var js = [
      'function renderNote(n,text){',
      '  document.getElementById("slide-badge").textContent=',
      '    "Slide "+String(n).padStart(2,"0")+" / 48";',
      '  document.getElementById("conn-dot").classList.remove("waiting");',
      '  document.getElementById("waiting").style.display="none";',
      '  var w=document.getElementById("script-wrap");',
      '  w.style.display="block";',
      '  var paras=(text||"No notes for this slide.").split(/\\n\\n+/);',
      '  w.innerHTML=paras.map(function(p){',
      '    return "<div class=\\"para animate\\">"+p.trim().replace(/\\n/g,"<br>")+"</div>";',
      '  }).join("");',
      '  document.getElementById("body-wrap").scrollTop=0;',
      '}',
      // Read from localStorage channel
      'function fromStorage(){',
      '  try{',
      '    var raw=localStorage.getItem("brady_slide_data");',
      '    if(!raw)return;',
      '    var d=JSON.parse(raw);',
      '    renderNote(d.n,d.text);',
      '  }catch(e){}',
      '}',
      // Also accept postMessage (tertiary)
      'window.addEventListener("message",function(e){',
      '  if(e.data&&e.data.type==="notes-slide")renderNote(e.data.n,e.data.text);',
      '});',
      // Listen to localStorage updates from main window
      'window.addEventListener("storage",function(e){',
      '  if(e.key==="brady_slide_data")fromStorage();',
      '});',
      // On load: try opener callback first, then localStorage fallback
      'window.addEventListener("load",function(){',
      '  try{',
      '    if(window.opener&&window.opener.bradySendNotes){',
      '      window.opener.bradySendNotes();',  # opener pushes current slide immediately
      '    }else{',
      '      fromStorage();',
      '    }',
      '  }catch(e){fromStorage();}',
      '});'
    ].join('');

    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<title>Speaker Notes — Brady Hotels × April 2026</title>' +
      '<style>' + css + '</style>' +
      '</head><body>' +
      '<div id="header">' +
        '<div id="slide-badge">Slide — / 48</div>' +
        '<div id="slide-title">Waiting for presentation…</div>' +
        '<div id="conn-dot" class="waiting"></div>' +
      '</div>' +
      '<div id="body-wrap">' +
        '<div id="waiting">' +
          '<svg width="48" height="48" viewBox="0 0 48 48" fill="none">' +
            '<circle cx="24" cy="24" r="20" stroke="white" stroke-width="2.5"/>' +
            '<path d="M24 14v10l6 6" stroke="white" stroke-width="2.5" stroke-linecap="round"/>' +
          '</svg>' +
          'Open a slide to sync speaker notes.' +
        '</div>' +
        '<div id="script-wrap"></div>' +
      '</div>' +
      '<script>' + js + '<\\/script>' +
      '</body></html>';
  })();

  var notesWin = null;

  // Expose so the popup can call us back once its listener is live
  window.bradySendNotes = function() {
    var n    = getSlideNum(getCurrentSlide());
    var text = NOTES[n] || 'No notes for this slide.';
    // Write to localStorage (popup's primary channel)
    try { localStorage.setItem('brady_slide_data', JSON.stringify({ n: n, text: text })); } catch(e) {}
    // postMessage as well (belt-and-suspenders)
    if (notesWin && !notesWin.closed) {
      try { notesWin.postMessage({ type: 'notes-slide', n: n, text: text }, '*'); } catch(e) {}
    }
  };

  function notesOpen() { return notesWin && !notesWin.closed; }

  function notesUpdate() {
    if (!notesOpen()) return;
    window.bradySendNotes();
  }

  function openNotesWindow() {
    var features = 'width=840,height=660,resizable=yes,scrollbars=yes,' +
                   'menubar=no,toolbar=no,location=no,status=no';
    notesWin = window.open('', 'brady_speaker_notes', features);
    if (!notesWin) {
      alert('Popup blocked! Please allow popups for this page, then press N again.');
      return;
    }
    notesWin.document.open();
    notesWin.document.write(POPUP_HTML);
    notesWin.document.close();
    // Pre-populate localStorage so popup has data the moment it reads it
    window.bradySendNotes();
  }

  function toggleNotes() {
    if (notesOpen()) {
      notesWin.close();
    } else {
      openNotesWindow();
    }
  }\
"""

assert OLD_BLOCK in html, 'Target block not found — verify exact whitespace'
html = html.replace(OLD_BLOCK, NEW_BLOCK, 1)
print('✓ Popup sync block replaced (opener callback + localStorage + postMessage)')

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'✓ Saved: {SRC}')
