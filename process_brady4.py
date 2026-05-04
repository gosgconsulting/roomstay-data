#!/usr/bin/env python3
"""Brady slides v4 – QA reorder: funnels first in each channel section,
split closing slide into Paid What We Do Next + SEO What We Do Next (42 total)."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/slides/brady-april-2026-hybrid.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Fix TOC grid CSS: 5-col → 3-col (2 rows for 6 cards) ─────────────────
old_toc_css = '      display: grid; grid-template-columns: repeat(5, 1fr);'
new_toc_css = '      display: grid; grid-template-columns: repeat(3, 1fr);'
if old_toc_css in content:
    content = content.replace(old_toc_css, new_toc_css)
    print('✓ TOC grid: 5-col → 3-col')
else:
    print('✗ TOC grid CSS not found')

# ── 2. Split into header, body (slides), footer ──────────────────────────────
first_comment_pos = content.index('<!-- ════ 1. COVER')
last_section_end_pos = content.rindex('</section>') + len('</section>')
header = content[:first_comment_pos]
body   = content[first_comment_pos:last_section_end_pos]
footer = content[last_section_end_pos:]

# ── 3. Split body into slide chunks at each <!-- ════ boundary ───────────────
parts  = re.split(r'(?=<!-- ════)', body)
chunks = [p for p in parts if p.strip()]
print(f'Parsed {len(chunks)} slide chunks')

if len(chunks) != 41:
    print(f'ERROR: Expected 41 chunks, got {len(chunks)}')
    for i, c in enumerate(chunks):
        print(f'  [{i:02d}] {c.split(chr(10))[0][:90]}')
    sys.exit(1)

# Chunk index reference (0-based):
# 0  Cover          7  SEM Divider   15 Meta Divider  22 Social Divider  32 SEO Divider
# 1  TOC            8  SEM Per Hotel 16 Meta Per Hotel 23 Social Per Hotel 33 SEO Group
# 2  Overview Div   9  SEM Breakdowns17 Meta Breakdowns24 Social Breakdowns34 SEO Brand
# 3  Hotel Portfolio10 SEM Funnel    18 Meta Funnel   25 Social Funnel   35 SEO Traffic
# 4  Results        11 SEM Action    19 Meta Action   26 Membership      36 SEO GA4
# 5  Channel Mix    12 SEM YTD       20 Meta YTD      27 Social Action   37 Action Divider
# 6  All Channels   13 SEM Assets    21 Meta Forecast 28 Social YTD      38 FY Forecast
#                   14 SEM Forecast               29 Social Assets    39 Forecast/Hotel
#                                                30 Social Forecast  40 What We Do Next(Paid)
#                                                31 Creative Refresh

# ── 4. Update TOC slide (chunk 1) ───────────────────────────────────────────
chunks[1] = """<!-- ════ 2. TOC ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow anim d1">Report Structure</div>
      <h2 class="slide-title anim d2">Table of Contents</h2>
    </div>
    <div class="slide-content">
      <div class="toc-grid">
        <div class="toc-card anim d2">
          <div class="toc-num">01</div>
          <div class="toc-title">Overview</div>
          <ul class="toc-list">
            <li>Hotel portfolio</li>
            <li>Per-hotel results</li>
            <li>Channel mix · YTD</li>
          </ul>
        </div>
        <div class="toc-card anim d3">
          <div class="toc-num">02</div>
          <div class="toc-title">SEM</div>
          <ul class="toc-list">
            <li>Funnel strategy</li>
            <li>Per hotel · Breakdowns</li>
            <li>Action plan · Assets</li>
            <li>YTD trend · Forecast</li>
          </ul>
        </div>
        <div class="toc-card meta anim d4">
          <div class="toc-num">03</div>
          <div class="toc-title">Metasearch</div>
          <ul class="toc-list">
            <li>Funnel strategy</li>
            <li>Per hotel · Breakdowns</li>
            <li>CPC action plan</li>
            <li>YTD trend · Forecast</li>
          </ul>
        </div>
        <div class="toc-card social anim d5">
          <div class="toc-num">04</div>
          <div class="toc-title">Social</div>
          <ul class="toc-list">
            <li>Funnel strategy</li>
            <li>Per hotel · Breakdowns</li>
            <li>Membership · Action plan</li>
            <li>Assets · Forecast · Creative</li>
          </ul>
        </div>
        <div class="toc-card seo anim d6">
          <div class="toc-num">05</div>
          <div class="toc-title">SEO &amp; Organic</div>
          <ul class="toc-list">
            <li>Group site · Hotel pages</li>
            <li>Brand vs Generic</li>
            <li>Seasonality YoY</li>
            <li>GA4 Organic revenue</li>
          </ul>
        </div>
        <div class="toc-card action anim d7">
          <div class="toc-num">06</div>
          <div class="toc-title">What We Do Next</div>
          <ul class="toc-list">
            <li>Full year forecast</li>
            <li>Paid channels priorities</li>
            <li>SEO priorities</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div class="slide-num">PLACEHOLDER</div>
</section>

"""
print('✓ TOC slide updated (6 cards)')

# ── 5. Update Action Plan divider (chunk 37) ─────────────────────────────────
chunks[37] = chunks[37].replace(
    'Section Six · Combined Strategy',
    'Section Six · Priorities'
).replace(
    'Cross-channel May 2026 budget moves and execution priorities.',
    'Paid channels and SEO — May 2026 next steps and execution priorities.'
)
print('✓ Action Plan divider updated')

# ── 6. Update "What We Do Next" slide (chunk 40) → Paid Channels only ────────
chunks[40] = chunks[40].replace(
    '<div class="slide-eyebrow action anim d1">May 2026 · Top 5 Priorities</div>',
    '<div class="slide-eyebrow action anim d1">May 2026 · Paid Channels Priorities</div>'
).replace(
    '<h2 class="slide-title anim d2">What We Do Next</h2>',
    '<h2 class="slide-title anim d2">What We Do Next — Paid Channels</h2>'
)
print('✓ Paid What We Do Next slide updated')

# ── 7. Create new SEO "What We Do Next" slide ────────────────────────────────
seo_next_slide = """<!-- ════ SEO — WHAT WE DO NEXT ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow seo anim d1">May 2026 · SEO Priorities</div>
      <h2 class="slide-title anim d2">What We Do Next — SEO</h2>
    </div>
    <div class="slide-content">
      <div style="display:flex;flex-direction:column;gap:var(--gap);flex:1;justify-content:center">
        <div class="action-card anim d2" style="border-left-color:var(--ch-seo)">
          <strong>① Brand SERP Defence</strong> — recover CTR lost to AI overviews &amp; sitelink crowding
          <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
            <li>Audit title tags &amp; meta descriptions on all 4 hotel pages (brand CTR fell 9.70% → 7.03% YoY)</li>
            <li>Expand Google Business Profiles — Photos, Posts, Q&amp;A — to own branded SERP real estate</li>
            <li>Add Hotel + FAQPage schema markup to reclaim rich-result sitelinks</li>
            <li>Weekly brand-position monitoring — target: avg position back to ≤3.5 by Jul 2026</li>
          </ul>
        </div>
        <div class="action-card anim d3" style="border-left-color:var(--ch-seo)">
          <strong>② Content Engine — Double Down</strong> — generic clicks already +73.8% YoY, keep compounding
          <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
            <li>Publish 2× long-form pages per month: dining guides, events, long-stay, neighbourhood content</li>
            <li>Target mid-funnel generic terms: "serviced apartments Melbourne CBD", "boutique hotels Melbourne"</li>
            <li>Internal linking: content pages → hotel landing pages to push booking intent</li>
            <li>Generic now 16.2% of organic clicks (was 7.7%) — set target of 25% by Dec 2026</li>
          </ul>
        </div>
        <div class="action-card anim d4" style="border-left-color:var(--ch-seo)">
          <strong>③ Hotel Page CTR &amp; On-Page Optimisation</strong>
          <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
            <li>Hardware Lane (CTR 1.60%) + Jones Lane (CTR 4.03%) — structured data &amp; OG image refresh</li>
            <li>Flinders Street: only hotel up +35% YoY — replicate its H1/H2 &amp; on-page structure across peers</li>
            <li>Central Melbourne jumped to position 3.4 — now focus on lifting CTR from 3.96% toward 6%+</li>
          </ul>
        </div>
        <div class="action-card action anim d5">
          <strong>④ Rebuild Session Base Before Jun–Sep Seasonal Peak</strong>
          <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
            <li>Sessions tracking −15% YoY in Apr — ramp content &amp; on-page updates in May before peak</li>
            <li>2025 seasonal peak: 7,471–7,694 organic sessions/mo (Jun–Sep) — target to match or exceed</li>
            <li>Revenue/Session at record $30.77 (+27.9% YoY) — maintain conversion quality while scaling volume</li>
          </ul>
        </div>
      </div>
      <div class="anim d6" style="margin-top:var(--gap);padding-top:var(--gap);border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div style="font-size:var(--fs-label);letter-spacing:0.22em;text-transform:uppercase;color:var(--text-light)">Prepared by</div>
          <div style="font-size:var(--fs-body);color:var(--text);font-weight:600">Dijitally Agency</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:var(--fs-label);letter-spacing:0.22em;text-transform:uppercase;color:var(--text-light)">Report Date</div>
          <div style="font-size:var(--fs-body);color:var(--text);font-weight:600">28 April 2026</div>
        </div>
      </div>
    </div>
  </div>
  <div class="section-tag seo">SEO</div>
  <div class="slide-num">PLACEHOLDER</div>
</section>

"""
print('✓ SEO What We Do Next slide created')

# ── 8. Reorder slides ─────────────────────────────────────────────────────────
# Target order: funnels move to immediately after each channel divider
new_order = [
    0,   # Cover
    1,   # TOC (updated — 6 cards)
    2,   # Overview Divider
    3,   # Hotel Portfolio
    4,   # Results per Hotel
    5,   # Channel Mix
    6,   # All Channels YTD
    # ─── SEM ───────────────────────────────────────────────────────────────
    7,   # SEM Divider
    10,  # SEM Funnel ← moved from pos 10 to right after divider
    8,   # SEM Per Hotel
    9,   # SEM Breakdowns
    11,  # SEM Action Plan
    12,  # SEM YTD
    13,  # SEM Assets
    14,  # SEM Forecast
    # ─── METASEARCH ────────────────────────────────────────────────────────
    15,  # Metasearch Divider
    18,  # Metasearch Funnel ← moved from pos 18 to right after divider
    16,  # Metasearch Per Hotel
    17,  # Metasearch Breakdowns
    19,  # Metasearch Action Plan
    20,  # Metasearch YTD
    21,  # Metasearch Forecast
    # ─── SOCIAL ────────────────────────────────────────────────────────────
    22,  # Social Divider
    25,  # Social Funnel ← moved from pos 25 to right after divider
    23,  # Social Per Hotel
    24,  # Social Breakdowns
    26,  # Membership
    27,  # Social Action Plan
    28,  # Social YTD
    29,  # Social Assets
    30,  # Social Forecast
    31,  # Creative Refresh (stays at end of Social section)
    # ─── SEO ───────────────────────────────────────────────────────────────
    32,  # SEO Divider
    33,  # SEO Group Site + Hotel Pages
    34,  # SEO Brand vs Generic
    35,  # SEO Organic Traffic YoY
    36,  # SEO GA4 Organic Overview
    # ─── WHAT WE DO NEXT ───────────────────────────────────────────────────
    37,  # Action Plan Divider (updated subtitle)
    38,  # Full Year Forecast
    39,  # Forecast per Hotel × Channel
    40,  # What We Do Next — Paid Channels (updated title)
    # 42nd slide = new SEO slide (appended below)
]

reordered = [chunks[i] for i in new_order]
reordered.append(seo_next_slide)
total = len(reordered)
print(f'✓ Slides reordered: {total} total')

# ── 9. Renumber all slide-num divs sequentially ───────────────────────────────
new_body = ''.join(reordered)
pattern = re.compile(r'<div class="slide-num">.*?</div>')
matches = list(pattern.finditer(new_body))
print(f'  Renumbering {len(matches)} slide-num divs…')

offset = 0
for i, m in enumerate(matches):
    new_text = f'<div class="slide-num">{i+1:02d} / {total}</div>'
    start = m.start() + offset
    end   = m.end()   + offset
    new_body = new_body[:start] + new_text + new_body[end:]
    offset  += len(new_text) - (m.end() - m.start())

print(f'✓ Renumbered: 01/{total} → {total:02d}/{total}')

# ── 10. Write output ──────────────────────────────────────────────────────────
with open('public/slides/brady-april-2026-hybrid.html', 'w', encoding='utf-8') as f:
    f.write(header + new_body + footer)

print(f'\n✓ File written — {total} slides total.')
print('Done.')
