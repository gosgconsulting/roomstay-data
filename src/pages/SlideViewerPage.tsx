import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Maximize2, Minimize2, ExternalLink, FileDown,
  Pencil, Check, Plus, PanelLeft,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Type, ImageIcon, ScrollText,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// Map deck IDs to their public HTML paths
const DECK_SRCS: Record<string, string> = {
  "brady-april-2026": "/slides/brady-april-2026.html",
  "brady-april-2026-full": "/slides/brady-april-2026-full.html",
  "brady-april-2026-highlevel": "/slides/brady-april-2026-highlevel.html",
  "brady-april-2026-hybrid": "/slides/brady-april-2026-hybrid.html",
  "brady-elizabeth-launch": "/slides/brady-elizabeth-launch.html",
  "brady-creative-refresh-april-2026": "/slides/brady-creative-refresh-april-2026.html",
  "brady-wip-april-2026": "/slides/brady-wip-april-2026.html",
};

// ─── Slide templates ──────────────────────────────────────────────────────────

// Shared iridescent gradient used by both Dijitally deck styles
const GRAD = "linear-gradient(90deg,#E84B3C 0%,#C2358F 25%,#5E3FBE 50%,#2B6FE0 75%,#5DC8C5 100%)";
const GRAD_V = "linear-gradient(180deg,#E84B3C 0%,#C2358F 25%,#5E3FBE 50%,#2B6FE0 75%,#5DC8C5 100%)";

// Base inline styles shared across templates
const BASE_SLIDE = `display:flex;flex-direction:column;position:relative;width:100vw;height:100vh;height:100dvh;scroll-snap-align:start;overflow:hidden;`;
const FONT = `font-family:'Manrope',Inter,-apple-system,sans-serif;`;

type TemplateKey =
  | "cover-dark"
  | "cover-light"
  | "title-dark"
  | "title-light"
  | "two-col-dark"
  | "two-col-light"
  | "blank-dark"
  | "blank-light";

type TemplateGroup = { group: string; templates: TemplateKey[] };

const TEMPLATE_GROUPS: TemplateGroup[] = [
  { group: "Cover / Divider", templates: ["cover-dark", "cover-light"] },
  { group: "Title + Content", templates: ["title-dark", "title-light"] },
  { group: "Two Columns",     templates: ["two-col-dark", "two-col-light"] },
  { group: "Blank",           templates: ["blank-dark", "blank-light"] },
];

const SLIDE_TEMPLATES: Record<TemplateKey, { label: string; dark: boolean; html: string }> = {

  /* ── COVER DARK ─────────────────────────────────────────────────────────── */
  "cover-dark": {
    label: "Cover — Dark",
    dark: true,
    html: `<section class="slide" style="${BASE_SLIDE}align-items:center;justify-content:center;text-align:center;padding:4rem;background:#0d1428;color:#fff;${FONT}">
  <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${GRAD}"></div>
  <p style="font-size:0.68rem;letter-spacing:0.24em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:1.4rem;" contenteditable="true">SECTION HEADING</p>
  <h1 style="font-size:clamp(2.5rem,6vw,5rem);font-weight:800;line-height:1.05;letter-spacing:-0.02em;margin-bottom:1rem;" contenteditable="true">New Slide Title</h1>
  <p style="font-size:clamp(0.9rem,1.4vw,1.1rem);color:rgba(255,255,255,0.55);max-width:38rem;line-height:1.6;" contenteditable="true">Subtitle or description text goes here.</p>
  <div style="position:absolute;bottom:1.4rem;left:2rem;font-size:0.62rem;color:rgba(255,255,255,0.22);letter-spacing:0.12em;text-transform:uppercase;" contenteditable="true">DIJITALLY</div>
  <div style="position:absolute;bottom:1.4rem;right:2rem;font-size:0.62rem;color:rgba(255,255,255,0.22);letter-spacing:0.06em;" contenteditable="true">Client × Brand</div>
</section>`,
  },

  /* ── COVER LIGHT ────────────────────────────────────────────────────────── */
  "cover-light": {
    label: "Cover — Light",
    dark: false,
    html: `<section class="slide" style="${BASE_SLIDE}align-items:center;justify-content:center;text-align:center;padding:4rem;background:#ffffff;color:#11192E;${FONT}">
  <div style="position:absolute;top:0;left:0;bottom:0;width:12px;background:${GRAD_V}"></div>
  <p style="font-size:0.68rem;letter-spacing:0.24em;text-transform:uppercase;color:#8C93A4;margin-bottom:1.4rem;" contenteditable="true">SECTION HEADING</p>
  <h1 style="font-size:clamp(2.5rem,6vw,5rem);font-weight:800;line-height:1.05;letter-spacing:-0.02em;margin-bottom:1rem;color:#11192E;" contenteditable="true">New Slide Title</h1>
  <p style="font-size:clamp(0.9rem,1.4vw,1.1rem);color:#5A6377;max-width:38rem;line-height:1.6;" contenteditable="true">Subtitle or description text goes here.</p>
  <div style="position:absolute;bottom:1.4rem;left:2.5rem;font-size:0.62rem;color:#8C93A4;letter-spacing:0.12em;text-transform:uppercase;" contenteditable="true">DIJITALLY</div>
  <div style="position:absolute;bottom:1.4rem;right:2rem;font-size:0.62rem;color:#8C93A4;letter-spacing:0.06em;" contenteditable="true">Client × Brand</div>
</section>`,
  },

  /* ── TITLE + CONTENT DARK ───────────────────────────────────────────────── */
  "title-dark": {
    label: "Title + Content — Dark",
    dark: true,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 4rem;background:#0d1428;color:#fff;${FONT}">
  <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${GRAD}"></div>
  <h2 style="font-size:clamp(1.5rem,3.2vw,2.6rem);font-weight:800;margin-bottom:0.5rem;letter-spacing:-0.015em;" contenteditable="true">Slide Title</h2>
  <div style="width:2.5rem;height:2px;background:${GRAD};margin-bottom:2rem;border-radius:2px;"></div>
  <div style="flex:1;font-size:clamp(0.85rem,1.3vw,1rem);line-height:1.75;color:rgba(255,255,255,0.75);min-height:0;" contenteditable="true">Add your content here. Click to edit this text.</div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;border-top:1px solid rgba(255,255,255,0.08);font-size:0.62rem;color:rgba(255,255,255,0.22);letter-spacing:0.1em;margin-top:0.5rem;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },

  /* ── TITLE + CONTENT LIGHT ──────────────────────────────────────────────── */
  "title-light": {
    label: "Title + Content — Light",
    dark: false,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 3.5rem 3rem 4.5rem;background:#ffffff;color:#11192E;${FONT}">
  <div style="position:absolute;top:0;left:0;bottom:0;width:12px;background:${GRAD_V}"></div>
  <h2 style="font-size:clamp(1.5rem,3.2vw,2.6rem);font-weight:800;margin-bottom:0.5rem;letter-spacing:-0.015em;color:#11192E;" contenteditable="true">Slide Title</h2>
  <div style="width:2.5rem;height:2px;background:${GRAD};margin-bottom:2rem;border-radius:2px;"></div>
  <div style="flex:1;font-size:clamp(0.85rem,1.3vw,1rem);line-height:1.75;color:#5A6377;min-height:0;" contenteditable="true">Add your content here. Click to edit this text.</div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;border-top:1px solid #E5E7EB;font-size:0.62rem;color:#8C93A4;letter-spacing:0.1em;margin-top:0.5rem;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },

  /* ── TWO COLUMNS DARK ───────────────────────────────────────────────────── */
  "two-col-dark": {
    label: "Two Columns — Dark",
    dark: true,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 4rem;background:#0d1428;color:#fff;${FONT}">
  <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${GRAD}"></div>
  <h2 style="font-size:clamp(1.5rem,3.2vw,2.6rem);font-weight:800;margin-bottom:2rem;letter-spacing:-0.015em;" contenteditable="true">Two Column Layout</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex:1;min-height:0;">
    <div style="padding:1.5rem;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.07);font-size:0.9rem;line-height:1.7;color:rgba(255,255,255,0.75);" contenteditable="true">Left column content goes here.</div>
    <div style="padding:1.5rem;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.07);font-size:0.9rem;line-height:1.7;color:rgba(255,255,255,0.75);" contenteditable="true">Right column content goes here.</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;margin-top:0.8rem;border-top:1px solid rgba(255,255,255,0.08);font-size:0.62rem;color:rgba(255,255,255,0.22);letter-spacing:0.1em;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },

  /* ── TWO COLUMNS LIGHT ──────────────────────────────────────────────────── */
  "two-col-light": {
    label: "Two Columns — Light",
    dark: false,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 3.5rem 3rem 4.5rem;background:#ffffff;color:#11192E;${FONT}">
  <div style="position:absolute;top:0;left:0;bottom:0;width:12px;background:${GRAD_V}"></div>
  <h2 style="font-size:clamp(1.5rem,3.2vw,2.6rem);font-weight:800;margin-bottom:2rem;letter-spacing:-0.015em;color:#11192E;" contenteditable="true">Two Column Layout</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex:1;min-height:0;">
    <div style="padding:1.5rem;background:#F7F8FA;border-radius:10px;border:1px solid #E5E7EB;font-size:0.9rem;line-height:1.7;color:#5A6377;" contenteditable="true">Left column content goes here.</div>
    <div style="padding:1.5rem;background:#F7F8FA;border-radius:10px;border:1px solid #E5E7EB;font-size:0.9rem;line-height:1.7;color:#5A6377;" contenteditable="true">Right column content goes here.</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;margin-top:0.8rem;border-top:1px solid #E5E7EB;font-size:0.62rem;color:#8C93A4;letter-spacing:0.1em;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },

  /* ── BLANK DARK ─────────────────────────────────────────────────────────── */
  "blank-dark": {
    label: "Blank — Dark",
    dark: true,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 4rem;background:#0d1428;color:#fff;${FONT}">
  <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${GRAD}"></div>
  <div style="flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.12);font-style:italic;font-size:1.1rem;" contenteditable="true">Click to add content</div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;border-top:1px solid rgba(255,255,255,0.08);font-size:0.62rem;color:rgba(255,255,255,0.22);letter-spacing:0.1em;margin-top:0.5rem;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },

  /* ── BLANK LIGHT ────────────────────────────────────────────────────────── */
  "blank-light": {
    label: "Blank — Light",
    dark: false,
    html: `<section class="slide" style="${BASE_SLIDE}padding:3rem 3.5rem 3rem 4.5rem;background:#ffffff;color:#11192E;${FONT}">
  <div style="position:absolute;top:0;left:0;bottom:0;width:12px;background:${GRAD_V}"></div>
  <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#D1D5DB;font-style:italic;font-size:1.1rem;" contenteditable="true">Click to add content</div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.9rem;border-top:1px solid #E5E7EB;font-size:0.62rem;color:#8C93A4;letter-spacing:0.1em;margin-top:0.5rem;">
    <span contenteditable="true">DIJITALLY</span>
    <span contenteditable="true">Client × Brand</span>
  </div>
</section>`,
  },
};

// ─── Script injected into the slide iframe ────────────────────────────────────

const IFRAME_HELPER_SCRIPT = /* js */ `
(function() {
  if (window.__roomstayHelper) return;
  window.__roomstayHelper = true;

  var slides = [];
  var currentIndex = 0;
  var editMode = false;
  var selectedBlock = null;

  // ── Slide info ──────────────────────────────────────────────────────────────
  function getSlides() { return Array.from(document.querySelectorAll('.slide')); }

  function getTitle(slide, i) {
    var el = slide.querySelector('h1,h2,h3');
    return (el && el.textContent.trim().substring(0, 60)) || ('Slide ' + (i + 1));
  }

  function reportState() {
    slides = getSlides();
    parent.postMessage({ type: 'roomstay-slides-init', total: slides.length, titles: slides.map(getTitle) }, '*');
  }

  function setupObserver() {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.intersectionRatio > 0.5) {
          var idx = slides.indexOf(entry.target);
          if (idx !== -1 && idx !== currentIndex) {
            currentIndex = idx;
            parent.postMessage({ type: 'roomstay-slide-change', index: idx }, '*');
          }
        }
      });
    }, { threshold: 0.5 });
    slides.forEach(function(s) { observer.observe(s); });
  }

  // ── Slide-level hover overlay (duplicate / delete) ──────────────────────────
  function createSlideOverlay(slide) {
    if (slide.querySelector('.__rs-overlay')) return;
    slide.style.position = 'relative';

    var overlay = document.createElement('div');
    overlay.className = '__rs-overlay';
    overlay.style.cssText = 'position:absolute;top:10px;right:10px;z-index:9999;display:none;gap:6px;align-items:center;background:rgba(7,16,30,0.9);border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:6px 10px;backdrop-filter:blur(16px);box-shadow:0 8px 32px rgba(0,0,0,0.6)';

    var badge = document.createElement('span');
    badge.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);font-family:system-ui,sans-serif;padding-right:8px;border-right:1px solid rgba(255,255,255,0.12);margin-right:2px;letter-spacing:0.05em;text-transform:uppercase';
    badge.textContent = 'Slide';
    overlay.appendChild(badge);

    function makeBtn(html, bg, fn) {
      var btn = document.createElement('button');
      btn.innerHTML = html;
      btn.style.cssText = 'background:' + bg + ';color:white;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:4px;line-height:1;transition:opacity .15s;white-space:nowrap';
      btn.onmouseenter = function() { btn.style.opacity='0.8'; };
      btn.onmouseleave = function() { btn.style.opacity='1'; };
      btn.onclick = function(e) { e.stopPropagation(); fn(); };
      return btn;
    }

    var dupBtn = makeBtn('&#10697; Duplicate', 'rgba(99,102,241,0.75)', function() {
      var clone = slide.cloneNode(true);
      clone.querySelectorAll('.__rs-overlay,.__rs-block').forEach(function(el) { el.remove(); });
      slide.after(clone);
      slides = getSlides();
      parent.postMessage({ type: 'roomstay-slide-duplicated', total: slides.length, titles: slides.map(getTitle) }, '*');
      setTimeout(setupEditOverlays, 100);
    });

    var delBtn = makeBtn('&#128465; Delete', 'rgba(239,68,68,0.75)', function() {
      var i = getSlides().indexOf(slide);
      slide.remove();
      slides = getSlides();
      parent.postMessage({ type: 'roomstay-slide-deleted', index: i, total: slides.length, titles: slides.map(getTitle) }, '*');
    });

    overlay.appendChild(dupBtn);
    overlay.appendChild(delBtn);
    slide.appendChild(overlay);

    slide.addEventListener('mouseenter', function() { if (editMode) overlay.style.display = 'flex'; });
    slide.addEventListener('mouseleave', function(e) { if (!overlay.contains(e.relatedTarget)) overlay.style.display = 'none'; });
    overlay.addEventListener('mouseleave', function(e) { if (!slide.contains(e.relatedTarget)) overlay.style.display = 'none'; });
  }

  function setupEditOverlays() {
    slides = getSlides();
    slides.forEach(createSlideOverlay);
  }

  // ── Block system ────────────────────────────────────────────────────────────

  var RESIZE_DIRS = ['nw','n','ne','e','se','s','sw','w'];
  var RESIZE_POS = {
    nw:'top:-5px;left:-5px;cursor:nw-resize',
    n: 'top:-5px;left:calc(50% - 5px);cursor:n-resize',
    ne:'top:-5px;right:-5px;cursor:ne-resize',
    e: 'top:calc(50% - 5px);right:-5px;cursor:e-resize',
    se:'bottom:-5px;right:-5px;cursor:se-resize',
    s: 'bottom:-5px;left:calc(50% - 5px);cursor:s-resize',
    sw:'bottom:-5px;left:-5px;cursor:sw-resize',
    w: 'top:calc(50% - 5px);left:-5px;cursor:w-resize'
  };

  function deselectBlock() {
    if (!selectedBlock) return;
    selectedBlock.style.outline = 'none';
    selectedBlock.style.boxShadow = 'none';
    var bar = selectedBlock.querySelector('.__rs-bar');
    if (bar) bar.style.display = 'none';
    selectedBlock.querySelectorAll('.__rs-rh').forEach(function(h) { h.style.display = 'none'; });
    var body = selectedBlock.querySelector('.__rs-body');
    if (body && body.getAttribute('contenteditable') === 'true') {
      body.setAttribute('contenteditable', 'false');
    }
    selectedBlock = null;
  }

  function selectBlock(block) {
    if (selectedBlock === block) return;
    deselectBlock();
    selectedBlock = block;
    block.style.outline = '2px solid #6366f1';
    block.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.18)';
    var bar = block.querySelector('.__rs-bar');
    if (bar) bar.style.display = 'flex';
    block.querySelectorAll('.__rs-rh').forEach(function(h) { h.style.display = 'block'; });
  }

  function startDrag(block, e) {
    e.preventDefault();
    e.stopPropagation();
    var slide = block.parentElement;
    var slideRect = slide.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY;
    var startL = parseFloat(block.style.left) || 0;
    var startT = parseFloat(block.style.top) || 0;

    function onMove(e) {
      var dx = e.clientX - startX, dy = e.clientY - startY;
      block.style.left = Math.max(0, Math.min(startL + dx, slideRect.width - 40)) + 'px';
      block.style.top  = Math.max(0, Math.min(startT + dy, slideRect.height - 20)) + 'px';
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResize(block, dir, e) {
    e.preventDefault();
    e.stopPropagation();
    var slide = block.parentElement;
    var slideRect = slide.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY;
    var startW = block.offsetWidth, startH = block.offsetHeight;
    var startL = parseFloat(block.style.left) || 0;
    var startT = parseFloat(block.style.top) || 0;

    function onMove(e) {
      var dx = e.clientX - startX, dy = e.clientY - startY;
      var nW = startW, nH = startH, nL = startL, nT = startT;
      if (dir.indexOf('e') >= 0) nW = Math.max(60, startW + dx);
      if (dir.indexOf('w') >= 0) { nW = Math.max(60, startW - dx); nL = startL + (startW - nW); }
      if (dir.indexOf('s') >= 0) nH = Math.max(28, startH + dy);
      if (dir.indexOf('n') >= 0) { nH = Math.max(28, startH - dy); nT = startT + (startH - nH); }
      nL = Math.max(0, Math.min(nL, slideRect.width - 40));
      nT = Math.max(0, Math.min(nT, slideRect.height - 20));
      block.style.width  = nW + 'px';
      block.style.height = (dir === 'n' || dir === 's' || dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw') ? nH + 'px' : block.style.height;
      block.style.left   = nL + 'px';
      block.style.top    = nT + 'px';
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function makeBlock(opts) {
    var isImg = opts.type === 'image';
    var block = document.createElement('div');
    block.className = '__rs-block';
    block.style.cssText = [
      'position:absolute',
      'left:' + (opts.x || 60) + 'px',
      'top:' + (opts.y || 60) + 'px',
      'width:' + (opts.w || (isImg ? 300 : 240)) + 'px',
      isImg ? 'height:' + (opts.h || 200) + 'px' : 'min-height:36px',
      'z-index:200',
      'box-sizing:border-box',
      'outline:none',
      'border-radius:3px',
    ].join(';');

    // ── Floating bar (drag handle + label + delete) ──
    var bar = document.createElement('div');
    bar.className = '__rs-bar';
    bar.style.cssText = 'position:absolute;top:-28px;left:0;min-width:100%;height:26px;display:none;align-items:center;gap:4px;background:#4f46e5;border-radius:5px 5px 0 0;padding:0 8px;z-index:201;white-space:nowrap;overflow:hidden;box-sizing:border-box;cursor:move;user-select:none;';

    var grip = document.createElement('span');
    grip.innerHTML = '&#8942;&#8942;';
    grip.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:-2px;flex-shrink:0;';
    bar.appendChild(grip);

    var typeLabel = document.createElement('span');
    typeLabel.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.6);font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:0.08em;flex:1;margin-left:2px;';
    typeLabel.textContent = isImg ? 'Image' : 'Text';
    bar.appendChild(typeLabel);

    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'background:rgba(239,68,68,0.8);color:#fff;border:none;border-radius:3px;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;';
    delBtn.onclick = function(e) { e.stopPropagation(); if (selectedBlock === block) selectedBlock = null; block.remove(); };
    bar.appendChild(delBtn);

    bar.addEventListener('mousedown', function(e) {
      if (e.target === delBtn) return;
      startDrag(block, e);
    });
    block.appendChild(bar);

    // ── Block body ──
    var body;
    if (isImg) {
      body = document.createElement('img');
      body.className = '__rs-body';
      body.src = opts.src || '';
      body.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;border-radius:2px;pointer-events:none;user-select:none;';
      body.draggable = false;
    } else {
      body = document.createElement('div');
      body.className = '__rs-body';
      body.setAttribute('contenteditable', 'false');
      body.style.cssText = 'outline:none;min-height:28px;font-family:inherit;font-size:1.1rem;line-height:1.5;color:inherit;padding:6px 8px;word-break:break-word;white-space:pre-wrap;';
      body.textContent = opts.text || 'Text block';
    }
    block.appendChild(body);

    // ── Resize handles ──
    RESIZE_DIRS.forEach(function(dir) {
      var h = document.createElement('div');
      h.className = '__rs-rh';
      h.style.cssText = 'position:absolute;width:10px;height:10px;background:#fff;border:2px solid #6366f1;border-radius:2px;z-index:202;box-sizing:border-box;display:none;' + RESIZE_POS[dir] + ';';
      h.addEventListener('mousedown', function(e) { startResize(block, dir, e); });
      block.appendChild(h);
    });

    // ── Interaction ──
    block.addEventListener('mousedown', function(e) {
      if (e.target === delBtn || e.target.classList.contains('__rs-rh')) return;
      e.stopPropagation();
      selectBlock(block);
      // Enable text editing when clicking the body of a text block
      if (!isImg && e.target === body) {
        body.setAttribute('contenteditable', 'true');
        body.style.cursor = 'text';
      }
    });

    block.addEventListener('dblclick', function(e) {
      if (!isImg) {
        e.stopPropagation();
        selectBlock(block);
        body.setAttribute('contenteditable', 'true');
        body.style.cursor = 'text';
        body.focus();
        // Put cursor at end
        var range = document.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    return block;
  }

  function getCurrentSlide() {
    var wH = window.innerHeight;
    var found = getSlides().find(function(s) {
      var r = s.getBoundingClientRect();
      return r.top >= -wH * 0.4 && r.top <= wH * 0.4;
    });
    return found || getSlides()[currentIndex] || getSlides()[0];
  }

  function addTextBlock(slideEl, opts) {
    var r = slideEl.getBoundingClientRect();
    var block = makeBlock({
      type: 'text',
      x: Math.round(r.width * 0.1),
      y: Math.round(r.height * 0.35),
      w: Math.round(r.width * 0.45),
      text: opts && opts.text ? opts.text : 'Text block',
    });
    slideEl.appendChild(block);
    selectBlock(block);
    var body = block.querySelector('.__rs-body');
    if (body) {
      body.setAttribute('contenteditable', 'true');
      setTimeout(function() {
        body.focus();
        var range = document.createRange();
        range.selectNodeContents(body);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 30);
    }
    return block;
  }

  function addImageBlock(slideEl, src) {
    var r = slideEl.getBoundingClientRect();
    var block = makeBlock({
      type: 'image',
      x: Math.round(r.width * 0.1),
      y: Math.round(r.height * 0.15),
      w: Math.round(r.width * 0.45),
      h: Math.round(r.height * 0.55),
      src: src,
    });
    slideEl.appendChild(block);
    selectBlock(block);
    return block;
  }

  // ── Edit mode enable/disable ────────────────────────────────────────────────
  // ── Native element hover controls (edit + delete on template elements) ────────

  // Broader selector: catches template elements AND already-contenteditable ones
  var EDITABLE_SEL = 'h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,' +
    '[contenteditable],[class*="title"],[class*="eyebrow"],[class*="value"],' +
    '[class*="label"],[class*="num"],[class*="sub"],[class*="desc"],[class*="cover"],' +
    '[class*="meta"],[class*="tag"],[class*="stat"],[class*="kpi"],[class*="footer"]';

  function attachNativeControls(el) {
    if (el.__rsNative || el.closest('.__rs-block') || el.closest('.__rs-overlay')) return;
    el.__rsNative = true;

    // Ensure the element is editable
    if (!el.getAttribute('data-rs-editable')) {
      el.setAttribute('data-rs-editable', '1');
      el.setAttribute('contenteditable', 'true');
      el.style.cursor = 'text';
    }
    el.style.outline = 'none';

    // Give it a positioning context for the badge
    var prevPos = window.getComputedStyle(el).position;
    if (prevPos === 'static') {
      el.style.position = 'relative';
      el.dataset.rsPrevPos = 'static';
    }

    // Floating badge (shown on hover)
    var badge = document.createElement('div');
    badge.className = '__rs-native-badge';
    badge.style.cssText = [
      'position:absolute',
      'top:-11px',
      'right:-2px',
      'display:none',
      'align-items:center',
      'gap:3px',
      'z-index:8500',
      'pointer-events:all',
      'white-space:nowrap',
    ].join(';');

    // Element type label
    var lbl = document.createElement('span');
    lbl.style.cssText = 'background:#4f46e5;color:rgba(255,255,255,0.75);font-family:system-ui,sans-serif;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:1px 5px;border-radius:3px 0 0 3px;line-height:16px;';
    lbl.textContent = el.tagName.toLowerCase();
    badge.appendChild(lbl);

    // Delete button
    var del = document.createElement('button');
    del.innerHTML = '&#10005;';
    del.title = 'Delete this element';
    del.style.cssText = 'background:rgba(239,68,68,0.9);color:#fff;border:none;border-radius:0 3px 3px 0;width:18px;height:18px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;font-family:system-ui;';
    del.onclick = function(e) {
      e.stopPropagation();
      e.preventDefault();
      el.remove();
    };
    badge.appendChild(del);
    el.appendChild(badge);

    // Show badge on hover, hide on leave
    el.addEventListener('mouseenter', function() {
      if (!editMode) return;
      el.style.outline = '1.5px dashed rgba(99,102,241,0.55)';
      el.style.outlineOffset = '2px';
      badge.style.display = 'flex';
    });
    var hideOnLeave = function(e) {
      if (badge.contains(e.relatedTarget) || el.contains(e.relatedTarget)) return;
      el.style.outline = 'none';
      badge.style.display = 'none';
    };
    el.addEventListener('mouseleave', hideOnLeave);
    badge.addEventListener('mouseleave', hideOnLeave);
  }

  function enableEdit() {
    editMode = true;
    getSlides().forEach(function(slide) {
      slide.querySelectorAll(EDITABLE_SEL).forEach(function(el) {
        attachNativeControls(el);
      });
    });
    setupEditOverlays();
  }

  function disableEdit() {
    editMode = false;
    deselectBlock();
    // Remove badges and reset styles
    document.querySelectorAll('.__rs-native-badge').forEach(function(b) { b.remove(); });
    document.querySelectorAll('[data-rs-editable]').forEach(function(el) {
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-rs-editable');
      el.style.cursor = '';
      el.style.outline = '';
      el.__rsNative = false;
      if (el.dataset.rsPrevPos === 'static') {
        el.style.position = '';
        delete el.dataset.rsPrevPos;
      }
    });
    document.querySelectorAll('.__rs-overlay').forEach(function(el) { el.style.display = 'none'; });
  }

  // ── Global deselect on outside click ───────────────────────────────────────
  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.__rs-block')) deselectBlock();
  });

  // ── Message handler ─────────────────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.type) return;

    if (d.type === 'roomstay-goto-slide') {
      slides = getSlides();
      var sl = slides[d.index];
      if (sl) { sl.scrollIntoView({ behavior: 'smooth' }); currentIndex = d.index; }
    }
    if (d.type === 'roomstay-enable-edit')  enableEdit();
    if (d.type === 'roomstay-disable-edit') disableEdit();

    if (d.type === 'roomstay-add-text-block') {
      var sl = getCurrentSlide();
      if (sl) addTextBlock(sl, d);
    }
    if (d.type === 'roomstay-add-image-block') {
      var sl = getCurrentSlide();
      if (sl && d.src) addImageBlock(sl, d.src);
    }

    if (d.type === 'roomstay-add-slide') {
      slides = getSlides();
      var afterIdx = (typeof d.afterIndex === 'number' && d.afterIndex >= 0) ? d.afterIndex : slides.length - 1;
      var tmp = document.createElement('div');
      tmp.innerHTML = d.html;
      var newSlide = tmp.firstElementChild;
      if (slides[afterIdx]) { slides[afterIdx].after(newSlide); }
      else { document.body.appendChild(newSlide); }
      slides = getSlides();
      if (editMode) {
        setupEditOverlays();
        // Wire up native controls on elements in the newly-added slide
        newSlide.querySelectorAll(EDITABLE_SEL).forEach(function(el) {
          attachNativeControls(el);
        });
      }
      newSlide.scrollIntoView({ behavior: 'smooth' });
      parent.postMessage({ type: 'roomstay-slides-init', total: slides.length, titles: slides.map(getTitle) }, '*');
    }

    if (d.type === 'roomstay-exec-command') {
      try { document.execCommand(d.command, false, d.value || null); } catch(ex) {}
    }

  });

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    slides = getSlides();
    reportState();
    setupObserver();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlideViewerPage() {
  const { slideId } = useParams<{ slideId: string }>();
  const navigate = useNavigate();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const scriptChannelRef = useRef<BroadcastChannel | null>(null);
  const [slideCount, setSlideCount] = useState(0);
  const [slideTitles, setSlideTitles] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const src = slideId ? DECK_SRCS[slideId] : undefined;

  // Listen for postMessages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "roomstay-slides-init") {
        setSlideCount(d.total ?? 0);
        setSlideTitles(d.titles ?? []);
      }
      if (d.type === "roomstay-slide-change") {
        setCurrentSlide(d.index ?? 0);
      }
      if (d.type === "roomstay-slide-deleted" || d.type === "roomstay-slide-duplicated") {
        setSlideCount(d.total ?? 0);
        setSlideTitles(d.titles ?? []);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Track browser fullscreen changes (ESC key)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Broadcast slide changes to the script window via BroadcastChannel
  useEffect(() => {
    if (!slideId) return;
    // Lazily open channel on first slide change
    if (!scriptChannelRef.current) {
      scriptChannelRef.current = new BroadcastChannel(`roomstay-script::${slideId}`);
    }
    scriptChannelRef.current.postMessage({
      type: "slide-change",
      index: currentSlide,
      title: slideTitles[currentSlide] ?? "",
      total: slideCount,
    });
  }, [currentSlide, slideTitles, slideCount, slideId]);

  // Close channel on unmount
  useEffect(() => {
    return () => { scriptChannelRef.current?.close(); };
  }, []);

  const handleOpenScript = useCallback(() => {
    window.open(
      `/script/${slideId}`,
      `roomstay-script-${slideId}`,
      "width=640,height=820,menubar=no,toolbar=no,location=no"
    );
  }, [slideId]);

  // Close add-menu on outside click
  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-add-menu]")) setShowAddMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddMenu]);

  const injectHelper = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || (doc as any).__rsInjected) return;
    (doc as any).__rsInjected = true;
    const script = doc.createElement("script");
    script.textContent = IFRAME_HELPER_SCRIPT;
    doc.head.appendChild(script);
  }, []);

  const postToIframe = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  const handleIframeLoad = () => {
    injectHelper();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleToggleEdit = () => {
    if (!isEditMode) {
      postToIframe({ type: "roomstay-enable-edit" });
      setShowPanel(true);
    } else {
      postToIframe({ type: "roomstay-disable-edit" });
      setShowPanel(false);
    }
    setIsEditMode((p) => !p);
  };

  const handleGotoSlide = (idx: number) => {
    postToIframe({ type: "roomstay-goto-slide", index: idx });
  };

  const handleAddSlide = (key: TemplateKey) => {
    const tmpl = SLIDE_TEMPLATES[key];
    postToIframe({
      type: "roomstay-add-slide",
      html: tmpl.html,
      afterIndex: currentSlide,
    });
    setShowAddMenu(false);
  };

  const execCommand = (command: string, value?: string) => {
    postToIframe({ type: "roomstay-exec-command", command, value });
  };

  const handleAddTextBlock = () => {
    postToIframe({ type: "roomstay-add-text-block" });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (src) postToIframe({ type: "roomstay-add-image-block", src });
    };
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleDownloadPDF = () => {
    if (!src) return;
    const w = window.open(`${src}#pdf`, "_blank");
    if (!w) window.open(src, "_blank");
  };

  const handleExportPPT = () => {
    if (!src) return;
    // Open the deck in a new tab with #pptx — the deck rasterises every slide
    // to a JPEG and embeds each as a full-slide image in the PPTX (image-only,
    // not editable). Same visual fidelity as the PDF export. Replaces the
    // previous dom-to-pptx pipeline (editable text + vector charts) which
    // caused render fragility and bloated the bundle.
    const w = window.open(`${src}#pptx`, "_blank");
    if (!w) window.open(src, "_blank");
  };

  if (!src) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Slide deck not found.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const ACCENT_COLORS = ["#ffffff", "#d4a843", "#7cb9e8", "#98d4a3", "#e8786b", "#c084fc", "#f59e0b", "#00d4ff"];

  return (
    <div
      ref={containerRef}
      className="w-full h-screen bg-[#07101e] flex flex-col overflow-hidden"
    >
      {/* ── Top toolbar (hidden in fullscreen) ─────────────────────────────── */}
      {!isFullscreen && (
        <div className="flex-shrink-0 flex flex-col bg-[#161c2d] border-b border-white/10 z-50">

          {/* Row 1 — primary actions */}
          <div className="flex items-center justify-between px-3 h-11 gap-2">
            {/* Left: back + panel toggle */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10 gap-1.5"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-xs">Back to Slides</span>
              </Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button
                className={cn(
                  "h-8 w-8 rounded flex items-center justify-center transition-colors",
                  showPanel
                    ? "text-indigo-400 bg-indigo-500/15 hover:bg-indigo-500/25"
                    : "text-white/50 hover:text-white hover:bg-white/10"
                )}
                onClick={() => setShowPanel((p) => !p)}
                title="Toggle slide panel"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Right: export + edit + fullscreen */}
            <div className="flex items-center gap-1">
              <button
                className="h-8 px-2.5 rounded text-xs flex items-center gap-1.5 transition-colors text-white/60 hover:text-white hover:bg-white/10"
                onClick={handleExportPPT}
                title="Export as PowerPoint (image-only)"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none">
                  <rect x="3" y="2" width="14" height="18" rx="2" fill="#D04423" />
                  <path d="M17 2l4 4h-4V2z" fill="#A33319" />
                  <rect x="6" y="8" width="4" height="1.5" rx="0.5" fill="white" opacity="0.9" />
                  <circle cx="10.5" cy="11.5" r="2.5" fill="none" stroke="white" strokeWidth="1.2" opacity="0.9" />
                  <rect x="6" y="14" width="8" height="1.5" rx="0.5" fill="white" opacity="0.9" />
                </svg>
                Export PPT
              </button>

              <button
                className="h-8 px-2.5 rounded text-xs text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                onClick={handleDownloadPDF}
                title="Download PDF"
              >
                <FileDown className="h-3.5 w-3.5" />
                Download PDF
              </button>

              <button
                className="h-8 px-2.5 rounded text-xs text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                onClick={() => window.open(src, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Tab
              </button>

              {/* Script button */}
              <button
                className="h-8 px-2.5 rounded text-xs text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                onClick={handleOpenScript}
                title="Open speaker script in a new window — syncs with slide navigation"
              >
                <ScrollText className="h-3.5 w-3.5" />
                Script
              </button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              <button
                className={cn(
                  "h-8 px-3 rounded text-xs flex items-center gap-1.5 transition-colors font-medium",
                  isEditMode
                    ? "text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
                onClick={handleToggleEdit}
                title={isEditMode ? "Exit edit mode" : "Enter edit mode"}
              >
                {isEditMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {isEditMode ? "Done" : "Edit"}
              </button>

              <button
                className="h-8 px-2.5 rounded text-xs text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                onClick={toggleFullscreen}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fullscreen
              </button>
            </div>
          </div>

          {/* Row 2 — formatting toolbar (edit mode only) */}
          {isEditMode && (
            <div className="flex items-center gap-1 px-3 h-10 border-t border-white/[0.07] bg-[#111827]">
              {/* Insert blocks */}
              <div className="flex items-center gap-0.5 mr-1">
                <button
                  title="Add text block — drag & resize freely"
                  className="h-7 px-2 rounded flex items-center gap-1 text-[10px] font-medium text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 transition-colors border border-indigo-500/20"
                  onClick={handleAddTextBlock}
                >
                  <Type className="h-3 w-3" />
                  Text
                </button>
                <button
                  title="Add image — click to upload, then drag & resize"
                  className="h-7 px-2 rounded flex items-center gap-1 text-[10px] font-medium text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 transition-colors border border-violet-500/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-3 w-3" />
                  Image
                </button>
              </div>

              <div className="w-px h-4 bg-white/10 mx-1" />
              <span className="text-[10px] text-white/25 uppercase tracking-widest mr-1">Format</span>

              {/* Text style */}
              <div className="flex items-center gap-0.5">
                {([
                  { icon: <Bold className="h-3.5 w-3.5" />, cmd: "bold", title: "Bold (Ctrl+B)" },
                  { icon: <Italic className="h-3.5 w-3.5" />, cmd: "italic", title: "Italic (Ctrl+I)" },
                  { icon: <Underline className="h-3.5 w-3.5" />, cmd: "underline", title: "Underline (Ctrl+U)" },
                ] as const).map(({ icon, cmd, title }) => (
                  <button
                    key={cmd}
                    title={title}
                    className="h-7 w-7 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); execCommand(cmd); }}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Alignment */}
              <div className="flex items-center gap-0.5">
                {([
                  { icon: <AlignLeft className="h-3.5 w-3.5" />, cmd: "justifyLeft", title: "Align left" },
                  { icon: <AlignCenter className="h-3.5 w-3.5" />, cmd: "justifyCenter", title: "Center" },
                  { icon: <AlignRight className="h-3.5 w-3.5" />, cmd: "justifyRight", title: "Align right" },
                ] as const).map(({ icon, cmd, title }) => (
                  <button
                    key={cmd}
                    title={title}
                    className="h-7 w-7 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); execCommand(cmd); }}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Color swatches */}
              <span className="text-[10px] text-white/25 mr-1">Color</span>
              <div className="flex items-center gap-1">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color}
                    title={color}
                    className="h-4.5 w-4.5 rounded-full border border-white/20 hover:scale-125 transition-transform"
                    style={{ background: color, width: "18px", height: "18px" }}
                    onMouseDown={(e) => { e.preventDefault(); execCommand("foreColor", color); }}
                  />
                ))}
              </div>

              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Font size */}
              <span className="text-[10px] text-white/25 mr-1">Size</span>
              <div className="flex items-center gap-0.5">
                {(["1", "2", "3", "4", "5", "6", "7"] as const).map((size, i) => {
                  const labels = ["10", "13", "16", "18", "24", "32", "48"];
                  return (
                    <button
                      key={size}
                      title={`${labels[i]}px`}
                      className="h-6 px-1 rounded text-[10px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                      onMouseDown={(e) => { e.preventDefault(); execCommand("fontSize", size); }}
                    >
                      {labels[i]}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1" />
              <span className="text-[10px] text-white/30 font-mono">
                {currentSlide + 1} / {slideCount}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Body: slide panel + iframe ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left slide panel */}
        {showPanel && !isFullscreen && (
          <div className="flex-shrink-0 w-48 bg-[#0e1420] border-r border-white/10 flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07]">
              <span className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">
                Slides
              </span>
              {slideCount > 0 && (
                <span className="text-[10px] text-white/25 font-mono">{slideCount}</span>
              )}
            </div>

            {/* Slide list */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
              {slideCount === 0 && (
                <p className="text-[10px] text-white/20 text-center py-10">Loading slides…</p>
              )}
              {Array.from({ length: slideCount }, (_, i) => {
                const isActive = currentSlide === i;
                return (
                  <button
                    key={i}
                    onClick={() => handleGotoSlide(i)}
                    className={cn(
                      "w-full text-left rounded-lg overflow-hidden transition-all group border",
                      isActive
                        ? "border-indigo-500/70 ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-900/40"
                        : "border-white/[0.06] hover:border-white/20"
                    )}
                  >
                    {/* Thumbnail area (16:9) */}
                    <div
                      className="relative w-full bg-[#07101e]"
                      style={{ paddingBottom: "56.25%" }}
                    >
                      <div className="absolute inset-0 flex flex-col p-2">
                        {/* Top gradient accent */}
                        <div
                          className="h-px rounded-full mb-2 flex-shrink-0"
                          style={{
                            background: "linear-gradient(90deg,#00d4ff,#7c3aed,#f59e0b)",
                            opacity: isActive ? 1 : 0.4,
                          }}
                        />
                        {/* Title text */}
                        <p className="text-[6.5px] font-semibold text-white/70 leading-tight line-clamp-2 mb-1.5">
                          {slideTitles[i] || `Slide ${i + 1}`}
                        </p>
                        {/* Decorative content lines */}
                        <div className="space-y-0.5">
                          {[65, 80, 45, 70, 55].map((w, j) => (
                            <div
                              key={j}
                              className="h-px rounded-full bg-white/10"
                              style={{ width: `${w}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Slide number row */}
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 transition-colors",
                        isActive ? "bg-indigo-600/20" : "bg-[#0a1020] group-hover:bg-white/[0.03]"
                      )}
                    >
                      <span
                        className={cn(
                          "text-[9px] font-mono flex-shrink-0",
                          isActive ? "text-indigo-300" : "text-white/25"
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[8.5px] text-white/25 truncate flex-1 leading-tight">
                        {(slideTitles[i] || "").substring(0, 24)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Add slide button (edit mode only) */}
            {isEditMode && (
              <div className="p-2 border-t border-white/[0.07] relative" data-add-menu>
                <button
                  onClick={() => setShowAddMenu((m) => !m)}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs transition-all",
                    showAddMenu
                      ? "border-indigo-400/50 text-indigo-300 bg-indigo-500/10"
                      : "border-white/15 text-white/35 hover:text-white/60 hover:border-white/30 hover:bg-white/[0.03]"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Slide
                </button>

                {/* Template picker */}
                {showAddMenu && (
                  <div className="absolute bottom-full left-1 right-1 mb-1.5 bg-[#1a2038] border border-white/15 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50" style={{ width: "260px", left: "50%", transform: "translateX(-50%)" }}>
                    <div className="px-3 py-2 border-b border-white/[0.08]">
                      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
                        Choose template
                      </p>
                    </div>
                    <div className="py-1">
                      {TEMPLATE_GROUPS.map((group) => (
                        <div key={group.group}>
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-[9px] text-white/25 uppercase tracking-widest font-semibold">
                              {group.group}
                            </span>
                          </div>
                          <div className="px-2 pb-1 grid grid-cols-2 gap-1.5">
                            {group.templates.map((key) => {
                              const t = SLIDE_TEMPLATES[key];
                              return (
                                <button
                                  key={key}
                                  onClick={() => handleAddSlide(key)}
                                  className={cn(
                                    "flex flex-col items-start p-2 rounded-lg border transition-all hover:scale-[1.02] text-left",
                                    t.dark
                                      ? "bg-[#0d1428] border-white/10 hover:border-indigo-400/50"
                                      : "bg-white border-gray-200 hover:border-indigo-400/70"
                                  )}
                                >
                                  {/* Mini slide preview */}
                                  <div
                                    className="w-full rounded mb-1.5 overflow-hidden relative"
                                    style={{ paddingBottom: "56%", background: t.dark ? "#0d1428" : "#fff" }}
                                  >
                                    <div className="absolute inset-0 flex flex-col p-1">
                                      {/* Accent bar */}
                                      {t.dark ? (
                                        <div className="h-px mb-1 rounded-full" style={{ background: GRAD, opacity: 0.8 }} />
                                      ) : (
                                        <div className="absolute top-0 left-0 bottom-0 w-1 rounded-sm" style={{ background: GRAD_V }} />
                                      )}
                                      {/* Content lines */}
                                      <div className={cn("space-y-0.5 mt-0.5", !t.dark && "ml-1.5")}>
                                        <div className="h-1 rounded-full w-3/4" style={{ background: t.dark ? "rgba(255,255,255,0.35)" : "#11192E", opacity: t.dark ? 1 : 0.7 }} />
                                        <div className="h-px rounded-full w-1/2" style={{ background: t.dark ? "rgba(255,255,255,0.15)" : "#5A6377", opacity: 0.5 }} />
                                        <div className="h-px rounded-full w-2/3" style={{ background: t.dark ? "rgba(255,255,255,0.1)" : "#5A6377", opacity: 0.35 }} />
                                      </div>
                                    </div>
                                  </div>
                                  <span className={cn("text-[10px] font-semibold leading-tight", t.dark ? "text-white/70" : "text-gray-700")}>
                                    {t.dark ? "Dark" : "Light"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main slide iframe */}
        <div className="flex-1 relative bg-[#080d18]">
          {isEditMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-emerald-500/90 text-white text-xs rounded-full shadow-lg pointer-events-none select-none backdrop-blur">
              Edit mode — click any text to edit · hover slide for controls
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={src}
            title="Slide presentation"
            className="w-full h-full border-0"
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-modals"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>

      {/* Fullscreen exit hint */}
      {isFullscreen && (
        <button
          className="fixed top-3 right-3 z-50 h-8 px-2.5 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors bg-black/40 backdrop-blur"
          onClick={toggleFullscreen}
        >
          <Minimize2 className="h-3.5 w-3.5" />
          Exit Fullscreen
        </button>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />
    </div>
  );
}
