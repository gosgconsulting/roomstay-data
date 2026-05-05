#!/usr/bin/env python3
"""Brady slides v7 – Complete SEO section rewrite from April 2026 PDF report.

PDF Source: Brady x Dijitally _ Performance Report _ April 2026 (1).pdf
Key data extracted:
  Overview: 3,650 sessions (-16.8% YoY), 203 transactions (+13.4%), $113K rev (+10.5%), 4.6% CVR
  AI Search: 195 sessions, 6 transactions, $4,104 revenue, 3% CVR
  AI Visibility: 369 mentions, 267 citations
  Landing Pages (ordered newest → oldest):
    - Princes Theater LP: NEW late April 2026 | 2 terms on lower page 1
    - Crown Casino LP:    NEW start April 2026 | 1 term page 1, 8 terms page 2
    - Serviced Apartments: +2 kw page 1, +9 page 2 (+50% MoM)
    - MCEC Convention Ctr: +8 kw page 1, total 27 terms page 1
    - Marvel Stadium:     +2 kw page 1, first kw breaking into top 3
  Next Steps: Melbourne Business Hotels LP, Elizabeth Street copy, Flinders St review,
              internal linking, health checks, citation audit, backlink audit

Inserts 2 new slides after the GA4 Organic slide:
  #1 Landing Pages Performance (ordered newest first, with date badges)
  #2 AI Visibility

Updates:
  - SEO Divider subtitle
  - Organic Traffic YoY chart (April bar: run-rate 3,730* → actual 3,650)
  - GA4 Organic Overview (full April 2026 data from PDF)
  - SEO What We Do Next (aligned with PDF Next Steps)
  - TOC cards (add "Data: [date]" badges, reorder Social before Metasearch)

Total slides: 42 → 44
"""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FILE = 'public/slides/brady-april-2026-hybrid.html'
with open(FILE, 'r', encoding='utf-8') as f:
    c = f.read()

changes = 0
def rep(old, new, label):
    global c, changes
    if old in c:
        c = c.replace(old, new, 1)
        changes += 1
        print(f'  ✓ {label}')
        return True
    else:
        print(f'  ✗ NOT FOUND: {label}')
        return False

# ═══════════════════════════════════════════════════════════════
# 1. SEO SECTION DIVIDER — update subtitle
# ═══════════════════════════════════════════════════════════════
print('\n═══ 1. SEO SECTION DIVIDER ═══')
rep(
    'Group website + 4 hotel pages. Brand vs generic split, seasonality, and GA4 organic revenue.',
    'April 2026: 3,650 organic sessions · 203 transactions · $113K revenue · 4.6% CVR · 5 active landing pages · 369 AI mentions.',
    'SEO divider subtitle'
)

# ═══════════════════════════════════════════════════════════════
# 2. TOC SLIDE — add date badges + reorder Social before Metasearch
# ═══════════════════════════════════════════════════════════════
print('\n═══ 2. TOC CARDS — add date badges + reorder Social→Meta ═══')

# Replace full TOC slide cards section
old_toc_cards = '''        <div class="toc-card anim d2">
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
        </div>'''

new_toc_cards = '''        <div class="toc-card anim d2">
          <div class="toc-num">01</div>
          <div class="toc-title">Overview</div>
          <ul class="toc-list">
            <li>Hotel portfolio</li>
            <li>Per-hotel results</li>
            <li>Channel mix · YTD</li>
          </ul>
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--pos);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--pos);flex-shrink:0"></span>Data: 30 Apr 2026</div>
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
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--pos);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--pos);flex-shrink:0"></span>Data: 30 Apr 2026</div>
        </div>
        <div class="toc-card social anim d4">
          <div class="toc-num">03</div>
          <div class="toc-title">Social</div>
          <ul class="toc-list">
            <li>Funnel strategy</li>
            <li>Per hotel · Breakdowns</li>
            <li>Membership · Action plan</li>
            <li>Assets · Forecast · Creative</li>
          </ul>
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--pos);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--pos);flex-shrink:0"></span>Data: 30 Apr 2026</div>
        </div>
        <div class="toc-card meta anim d5">
          <div class="toc-num">04</div>
          <div class="toc-title">Metasearch</div>
          <ul class="toc-list">
            <li>Funnel strategy</li>
            <li>Per hotel · Breakdowns</li>
            <li>CPC action plan</li>
            <li>YTD trend · Forecast</li>
          </ul>
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--neutral);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--neutral);flex-shrink:0"></span>Data: 28 Apr 2026</div>
        </div>
        <div class="toc-card seo anim d6">
          <div class="toc-num">05</div>
          <div class="toc-title">SEO &amp; Organic</div>
          <ul class="toc-list">
            <li>April overview · AI visibility</li>
            <li>Landing pages (5 active)</li>
            <li>Brand vs Generic · YoY</li>
            <li>GA4 Organic revenue</li>
          </ul>
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--neutral);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--neutral);flex-shrink:0"></span>Data: 28 Apr 2026</div>
        </div>
        <div class="toc-card action anim d7">
          <div class="toc-num">06</div>
          <div class="toc-title">What We Do Next</div>
          <ul class="toc-list">
            <li>Full year forecast</li>
            <li>Paid channels priorities</li>
            <li>SEO priorities</li>
          </ul>
          <div style="font-size:var(--fs-label);margin-top:0.5rem;color:var(--neutral);font-weight:600;display:flex;align-items:center;gap:0.3rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--neutral);flex-shrink:0"></span>Data: 28 Apr 2026</div>
        </div>'''

rep(old_toc_cards, new_toc_cards, 'TOC cards (dates + Social before Meta)')

# ═══════════════════════════════════════════════════════════════
# 3. ORGANIC TRAFFIC YoY (slide 36) — April bar: run-rate → actual
# ═══════════════════════════════════════════════════════════════
print('\n═══ 3. ORGANIC TRAFFIC YoY — April actual 3,650 ═══')

rep(
    '<!-- Apr: 2025=4388, 2026=3730* (run-rate from 21d=2611) -->\n            <g><rect x="314" y="138.8" width="32" height="131.2" fill="#C8CDD7"/><rect x="350" y="158.5" width="32" height="111.5" fill="#5E3FBE" fill-opacity="0.55" stroke="#5E3FBE" stroke-width="2" stroke-dasharray="3,3"/><text x="348" y="291" font-family="Manrope" font-size="13" fill="#5A6377" text-anchor="middle">Apr</text><text x="330" y="133" font-family="Manrope" font-size="11" fill="#8C93A4" text-anchor="middle">4,388</text><text x="366" y="153" font-family="Manrope" font-size="11" fill="#5E3FBE" text-anchor="middle" font-weight="600">3,730*</text></g>',
    '<!-- Apr: 2025=4388, 2026=3650 (full month actual, PDF report) -->\n            <g><rect x="314" y="138.8" width="32" height="131.2" fill="#C8CDD7"/><rect x="350" y="160.9" width="32" height="109.1" fill="#5E3FBE"/><text x="348" y="291" font-family="Manrope" font-size="13" fill="#5A6377" text-anchor="middle">Apr</text><text x="330" y="133" font-family="Manrope" font-size="11" fill="#8C93A4" text-anchor="middle">4,388</text><text x="366" y="155" font-family="Manrope" font-size="11" fill="#5E3FBE" text-anchor="middle" font-weight="600">3,650</text></g>',
    'Organic sessions — April bar actual 3,650'
)

# Remove the run-rate legend note
rep(
    '              <text x="340" y="0" font-family="Manrope" font-size="11" fill="#8C93A4">* Apr 2026 = run-rate from 21 days actual (2,611 sessions)</text>',
    '              <text x="340" y="0" font-family="Manrope" font-size="11" fill="#8C93A4">2026 data: Windsor.ai + GA4 · Full April actuals from PDF report</text>',
    'Organic sessions — remove run-rate legend note'
)

# Update action card - change run-rate language
rep(
    '<strong>2026 YTD organic sessions tracking below 2025</strong> — Jan −23.9%, Feb −14.3%, Mar −11.3%, Apr −15.0% (run-rate). Gap is widest in Jan, narrowing through the quarter. <strong>YoY revenue however is up</strong> (+15.5% in current period) — fewer sessions but higher conversion + AOV. <strong>Action:</strong> ramp organic content publishing in May–June to rebuild the session base before the seasonal climb; protect brand SERP real estate to halt CTR slide.',
    '<strong>2026 YTD organic sessions tracking below 2025</strong> — Jan −23.9%, Feb −14.3%, Mar −11.3%, Apr −16.8% (actual: 3,650 sessions). Gap is widest in Jan, narrowing through Q1. <strong>Revenue +10.5% YoY ($113K)</strong> despite fewer sessions — CVR 4.6% is strong for April, showing users are highly engaged. <strong>Action:</strong> ramp organic content publishing in May–June to rebuild the session base before the seasonal climb (Jun–Sep peak); defend brand SERP real estate.',
    'Organic sessions — action card updated'
)

# ═══════════════════════════════════════════════════════════════
# 4. GA4 ORGANIC OVERVIEW (slide 37) — Full April 2026 from PDF
# ═══════════════════════════════════════════════════════════════
print('\n═══ 4. GA4 ORGANIC OVERVIEW — Full April 2026 data ═══')

# Eyebrow date
rep(
    '<div class="slide-eyebrow seo anim d1">SEO · GA4 Organic · 22 Mar – 21 Apr · YoY</div>',
    '<div class="slide-eyebrow seo anim d1">SEO · GA4 Organic · Full April 2026 · YoY</div>',
    'GA4 Organic — eyebrow date'
)

# Subtitle
rep(
    '<div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.3rem">GA4 Organic Search channel only. 2026 vs same 31-day window in 2025.</div>',
    '<div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.3rem">GA4 Organic Search channel only. Full April 2026 vs April 2025. Source: Dijitally SEO Report Apr 2026.</div>',
    'GA4 Organic — subtitle'
)

# KPI Card 1: Sessions 4,100 → 3,650
rep(
    '          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--ch-seo);line-height:1">4,100</div>\n          <div style="font-size:var(--fs-label);color:var(--neg);font-weight:600;margin-top:0.2rem">−9.7% YoY (4,538)</div>',
    '          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--ch-seo);line-height:1">3,650</div>\n          <div style="font-size:var(--fs-label);color:var(--neg);font-weight:600;margin-top:0.2rem">−16.8% YoY (4,388)</div>',
    'GA4 Organic — sessions KPI card'
)

# KPI Card 2: Conv Events 7,887 → Transactions 203
rep(
    '          <div style="font-size:var(--fs-label);letter-spacing:0.08em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">Organic Conv. Events</div>\n          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--text);line-height:1">7,887</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">+13.3% YoY (6,959)</div>',
    '          <div style="font-size:var(--fs-label);letter-spacing:0.08em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">Transactions</div>\n          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--text);line-height:1">203</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">+13.4% YoY (179)</div>',
    'GA4 Organic — transactions KPI card'
)

# KPI Card 3: Revenue $126,152 → $113K
rep(
    '          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--pos);line-height:1">$126,152</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">+15.5% YoY ($109K)</div>',
    '          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--pos);line-height:1">$113,000</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">+10.5% YoY ($102K)</div>',
    'GA4 Organic — revenue KPI card'
)

# KPI Card 4: Rev/Session $30.77 → CVR 4.6%
rep(
    '          <div style="font-size:var(--fs-label);letter-spacing:0.08em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">Revenue / Session</div>\n          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--text);line-height:1">$30.77</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">+27.9% YoY ($24.07)</div>',
    '          <div style="font-size:var(--fs-label);letter-spacing:0.08em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">Conv. Rate (CVR)</div>\n          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.2rem,2.1vw,1.7rem);color:var(--pos);line-height:1">4.6%</div>\n          <div style="font-size:var(--fs-label);color:var(--pos);font-weight:600;margin-top:0.2rem">Strong for April</div>',
    'GA4 Organic — CVR KPI card'
)

# 6-month bar chart — update total and April bar
rep(
    '<div class="ch-title" style="color:var(--ch-seo)">$657K · Nov 2025 → Apr 2026</div>',
    '<div class="ch-title" style="color:var(--ch-seo)">$685K · Nov 2025 → Apr 2026</div>',
    'GA4 Organic — 6-month total'
)

# April bar: dashed $122K* → solid $113K
rep(
    '              <!-- Apr: $85.5K (21d) → $122K run-rate -->\n              <g><rect x="485" y="20" width="60" height="150" fill="#5E3FBE" fill-opacity="0.55" stroke="#5E3FBE" stroke-width="2" stroke-dasharray="3,3"/><text x="515" y="190" font-family="Manrope" font-size="12" fill="#5A6377" text-anchor="middle">Apr 26*</text><text x="515" y="15" font-family="Manrope" font-size="11" fill="#5E3FBE" text-anchor="middle" font-weight="700">$122K*</text></g>\n              <text x="40" y="212" font-family="Manrope" font-size="10" fill="#8C93A4">* Apr 2026 = run-rate from 21 days actual ($85.5K)</text>',
    '              <!-- Apr: $113K (full April actual, PDF report) -->\n              <g><rect x="485" y="31" width="60" height="139" fill="#5E3FBE"/><text x="515" y="190" font-family="Manrope" font-size="12" fill="#5A6377" text-anchor="middle">Apr 26</text><text x="515" y="26" font-family="Manrope" font-size="11" fill="#11192E" text-anchor="middle" font-weight="600">$113K</text></g>\n              <text x="40" y="212" font-family="Manrope" font-size="10" fill="#8C93A4">Source: Dijitally SEO Report April 2026 · Full month actuals</text>',
    'GA4 Organic — April bar solid $113K'
)

# Update action card
rep(
    '<strong>Organic revenue +15.5% YoY</strong> on −9.7% sessions — Revenue/Session jumped from $24.07 to $30.77 (+27.9%). Conversion engine working harder per visit (better landing pages, price widgets, room availability UX). <strong>Risk:</strong> Brand position drifted from 3.2 → 5.0 (see prev slide) — fewer brand sessions ahead unless metadata + sitelinks are reclaimed. <strong>Action:</strong> hold the conversion gains and rebuild the session base before the seasonal climb (Jun–Sep).',
    '<strong>Organic revenue +10.5% YoY ($113K)</strong> on −16.8% sessions — but CVR 4.6% is very strong for April, meaning fewer but more committed visitors. Transactions +13.4% YoY (203 vs 179). <strong>AI Search adding $4,104</strong> from 195 sessions at 3% CVR — a small but growing channel to watch. <strong>Risk:</strong> sessions tracking below 2025; action required to rebuild base before Jun–Sep seasonal peak.',
    'GA4 Organic — action card'
)

# ═══════════════════════════════════════════════════════════════
# 5. INSERT NEW SLIDES (Landing Pages + AI Visibility)
#    Insert point: right before <!-- ════ 37. SECTION DIVIDER ACTION PLAN ════ -->
# ═══════════════════════════════════════════════════════════════
print('\n═══ 5. INSERT: Landing Pages + AI Visibility slides ═══')

LANDING_PAGES_SLIDE = '''

<!-- ════ NEW. SEO — LANDING PAGES PERFORMANCE ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow seo anim d1">SEO · Landing Pages · April 2026 · Keyword Movements</div>
      <h2 class="slide-title anim d2">Landing Pages — Rankings &amp; New Deployments</h2>
      <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.3rem">Cards ordered newest → oldest by deployment / last significant update. <span style="color:var(--pos);font-weight:600">New</span> = page launched in April 2026.</div>
    </div>
    <div class="slide-content">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--gap-sm);flex:1;min-height:0" class="anim d2">

        <!-- Princes Theater LP — late April 2026 (newest) -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--pos);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Princes Theater LP</div>
            <span style="background:var(--pos);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">NEW</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Deployed: Late April 2026</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted)">Indexed late April — 2 terms on lower page 1, strong first-month relevancy signal.</div>
          <table style="font-size:var(--fs-label);width:100%;border-collapse:collapse;margin-top:auto">
            <thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:0.2rem 0;color:var(--text-light)">Keyword</th><th style="color:var(--text-light);text-align:center">Prev</th><th style="color:var(--text-light);text-align:center">Now</th></tr></thead>
            <tbody style="color:var(--text)">
              <tr><td style="padding:0.2rem 0">accommodation near princess theatre</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">8</td></tr>
              <tr><td style="padding:0.2rem 0">best hotels near princess theatre melbourne</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">10</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Crown Casino LP — start of April 2026 -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--pos);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Crown Casino LP</div>
            <span style="background:var(--pos);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">NEW</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Deployed: Start April 2026</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted)">Indexed quickly — 1 term page 1, 8 terms page 2 in first month.</div>
          <table style="font-size:var(--fs-label);width:100%;border-collapse:collapse;margin-top:auto">
            <thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:0.2rem 0;color:var(--text-light)">Keyword</th><th style="color:var(--text-light);text-align:center">Prev</th><th style="color:var(--text-light);text-align:center">Now</th></tr></thead>
            <tbody style="color:var(--text)">
              <tr><td style="padding:0.2rem 0">accommodation close to crown casino melbourne</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">10</td></tr>
              <tr><td style="padding:0.2rem 0">melbourne cbd accommodation near crown casino</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">11</td></tr>
              <tr><td style="padding:0.2rem 0">hotel accommodation near crown casino melbourne</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">13</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Serviced Apartments LP — April 2026 improvement -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--ch-seo);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Serviced Apartments LP</div>
            <span style="background:var(--ch-seo);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">+50% MoM</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Updated: April 2026</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted)">+2 keywords page 1, +9 onto page 2. Strong momentum.</div>
          <table style="font-size:var(--fs-label);width:100%;border-collapse:collapse;margin-top:auto">
            <thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:0.2rem 0;color:var(--text-light)">Keyword</th><th style="color:var(--text-light);text-align:center">Prev</th><th style="color:var(--text-light);text-align:center">Now</th></tr></thead>
            <tbody style="color:var(--text)">
              <tr><td style="padding:0.2rem 0">service apt in melbourne</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">8</td></tr>
              <tr><td style="padding:0.2rem 0">serviced apartments melbourne cbd</td><td style="text-align:center;color:var(--text-muted)">20</td><td style="text-align:center;font-weight:700;color:var(--pos)">11</td></tr>
              <tr><td style="padding:0.2rem 0">accommodation melbourne cbd serviced apartments</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">12</td></tr>
            </tbody>
          </table>
        </div>

        <!-- MCEC Convention Center LP -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--ch-seo);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Convention Center LP</div>
            <span style="background:var(--ch-seo);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">27 P1 terms</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Updated: April 2026</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted)">MCEC LP: +8 keywords into page 1, total 27 terms on first page.</div>
          <table style="font-size:var(--fs-label);width:100%;border-collapse:collapse;margin-top:auto">
            <thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:0.2rem 0;color:var(--text-light)">Keyword</th><th style="color:var(--text-light);text-align:center">Prev</th><th style="color:var(--text-light);text-align:center">Now</th></tr></thead>
            <tbody style="color:var(--text)">
              <tr><td style="padding:0.2rem 0">melbourne convention centre hotels nearby</td><td style="text-align:center;color:var(--text-muted)">11</td><td style="text-align:center;font-weight:700;color:var(--pos)">7</td></tr>
              <tr><td style="padding:0.2rem 0">convention centre melbourne accommodation</td><td style="text-align:center;color:var(--text-muted)">N/A</td><td style="text-align:center;font-weight:700;color:var(--pos)">6</td></tr>
              <tr><td style="padding:0.2rem 0">accommodation near mcec melbourne</td><td style="text-align:center;color:var(--text-muted)">8</td><td style="text-align:center;font-weight:700;color:var(--pos)">7</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Marvel Stadium LP -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--ch-seo);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Marvel Stadium LP</div>
            <span style="background:var(--ch-seo);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">Top 3 ✓</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Updated: April 2026</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted)">+2 keywords into page 1 — first keyword breaking into top 3 positions.</div>
          <table style="font-size:var(--fs-label);width:100%;border-collapse:collapse;margin-top:auto">
            <thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:0.2rem 0;color:var(--text-light)">Keyword</th><th style="color:var(--text-light);text-align:center">Prev</th><th style="color:var(--text-light);text-align:center">Now</th></tr></thead>
            <tbody style="color:var(--text)">
              <tr><td style="padding:0.2rem 0">marvel stadium hotels</td><td style="text-align:center;color:var(--text-muted)">7</td><td style="text-align:center;font-weight:700;color:var(--pos)">3</td></tr>
              <tr><td style="padding:0.2rem 0">hotels near marvel stadium melbourne</td><td style="text-align:center;color:var(--text-muted)">7</td><td style="text-align:center;font-weight:700;color:var(--pos)">6</td></tr>
              <tr><td style="padding:0.2rem 0">accommodation melbourne near marvel stadium</td><td style="text-align:center;color:var(--text-muted)">8</td><td style="text-align:center;font-weight:700;color:var(--pos)">5</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Other recently launched LPs -->
        <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid var(--text-light);display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:var(--fs-body);font-weight:700;color:var(--text)">Recently Launched LPs</div>
            <span style="background:var(--text-light);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap">Monitoring</span>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-light)">Status: Indexed · Not yet ranking</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted);margin-bottom:0.3rem">Indexed — internal linking strategy in progress to boost discoverability and semantic relevance.</div>
          <ul style="font-size:var(--fs-label);color:var(--text);list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.3rem;margin-top:auto">
            <li style="display:flex;align-items:center;gap:0.4rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--text-light);flex-shrink:0"></span>/accommodation-near-queen-victoria-market/</li>
            <li style="display:flex;align-items:center;gap:0.4rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--text-light);flex-shrink:0"></span>/hotels-near-regent-theatre-melbourne/</li>
            <li style="display:flex;align-items:center;gap:0.4rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--text-light);flex-shrink:0"></span>/four-star-hotels-melbourne/</li>
            <li style="display:flex;align-items:center;gap:0.4rem"><span style="width:5px;height:5px;border-radius:50%;background:var(--text-light);flex-shrink:0"></span>/apartment-hotels-melbourne/</li>
          </ul>
        </div>

      </div>
    </div>
  </div>
  <div class="section-tag seo">SEO</div>
  <div class="slide-num">PLACEHOLDER</div>
</section>

'''

AI_VISIBILITY_SLIDE = '''<!-- ════ NEW. SEO — AI VISIBILITY ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow seo anim d1">SEO · AI Visibility · April 2026 · LLM Search</div>
      <h2 class="slide-title anim d2">AI Visibility — Brand Presence in LLM Search</h2>
      <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.3rem">Brady Hotels is being picked up, mentioned and cited in AI/LLM responses for relevant Melbourne accommodation searches.</div>
    </div>
    <div class="slide-content">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--gap-sm);margin-bottom:var(--gap)" class="anim d2">
        <div style="background:var(--bg-soft);border-radius:8px;padding:0.7rem var(--gap-sm);border-top:3px solid var(--ch-seo)">
          <div style="font-size:var(--fs-label);text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">AI Mentions</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.3rem,2.2vw,1.9rem);color:var(--ch-seo);line-height:1">369</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.2rem">Brand mentioned in AI responses</div>
        </div>
        <div style="background:var(--bg-soft);border-radius:8px;padding:0.7rem var(--gap-sm);border-top:3px solid var(--ch-seo)">
          <div style="font-size:var(--fs-label);text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">AI Citations</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.3rem,2.2vw,1.9rem);color:var(--ch-seo);line-height:1">267</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.2rem">Direct links cited by LLMs</div>
        </div>
        <div style="background:var(--bg-soft);border-radius:8px;padding:0.7rem var(--gap-sm);border-top:3px solid var(--pos)">
          <div style="font-size:var(--fs-label);text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">AI Sessions</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.3rem,2.2vw,1.9rem);color:var(--pos);line-height:1">195</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.2rem">Visitors from AI/LLM search</div>
        </div>
        <div style="background:var(--bg-soft);border-radius:8px;padding:0.7rem var(--gap-sm);border-top:3px solid var(--pos)">
          <div style="font-size:var(--fs-label);text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">AI Transactions</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.3rem,2.2vw,1.9rem);color:var(--pos);line-height:1">6</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.2rem">Bookings from AI traffic</div>
        </div>
        <div style="background:var(--bg-soft);border-radius:8px;padding:0.7rem var(--gap-sm);border-top:3px solid var(--pos)">
          <div style="font-size:var(--fs-label);text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:0.2rem">AI CVR</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:clamp(1.3rem,2.2vw,1.9rem);color:var(--pos);line-height:1">3%</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.2rem">$4,104 revenue · strong CVR</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);flex:1;min-height:0">
        <div class="chart-card anim d3" style="padding:var(--gap)">
          <div class="ch-sub">Search Types — Where Brady is Appearing in AI</div>
          <div class="ch-body" style="flex-direction:column;justify-content:flex-start;gap:0.8rem;margin-top:0.5rem">
            <div style="display:flex;align-items:flex-start;gap:0.8rem">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem">🏨</div>
              <div>
                <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Group Accommodation</div>
                <div style="font-size:var(--fs-small);color:var(--text-muted)">Brady Hotels appearing in LLM results for Melbourne group booking searches — group capacity, portfolio, and collection positioning working well.</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:0.8rem">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem">🛏️</div>
              <div>
                <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Stay Types</div>
                <div style="font-size:var(--fs-small);color:var(--text-muted)">Serviced apartments, long-stay, boutique hotel queries triggering Brady citations — content engine delivering AI-readable results.</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:0.8rem">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem">📍</div>
              <div>
                <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Accommodation Near Points of Interest</div>
                <div style="font-size:var(--fs-small);color:var(--text-muted)">Landing pages for Marvel Stadium, Crown Casino, MCEC, Princes Theater generating AI citations — hyper-local content strategy validated.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="chart-card anim d4" style="padding:var(--gap)">
          <div class="ch-sub">Why This Matters</div>
          <div class="ch-body" style="flex-direction:column;justify-content:flex-start;gap:0.7rem;margin-top:0.5rem">
            <div class="action-card" style="border-left-color:var(--ch-seo);margin:0;padding:0.6rem 0.8rem">
              <strong style="color:var(--ch-seo)">Signalling:</strong> AI crawlers understand Brady's content — structured data, clear location signals, and semantic content are working. 3% CVR from AI traffic is very strong.
            </div>
            <div class="action-card" style="border-left-color:var(--pos);margin:0;padding:0.6rem 0.8rem">
              <strong style="color:var(--pos)">Opportunity:</strong> 267 citations → 195 sessions → 6 bookings = $4,104 revenue. AI channel is nascent but converting above industry average. Double down on FAQ, structured data, and long-form content.
            </div>
            <div class="action-card" style="border-left-color:var(--neutral);margin:0;padding:0.6rem 0.8rem">
              <strong>Watch:</strong> AI Overviews are likely also reducing brand search CTR (position 5.0, CTR 7.03% vs 9.70% LY). Defensive brand SERP actions remain critical alongside the AI opportunity.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="section-tag seo">SEO</div>
  <div class="slide-num">PLACEHOLDER</div>
</section>

'''

INSERT_BEFORE = '<!-- ════ 37. SECTION DIVIDER ACTION PLAN ════ -->'
if INSERT_BEFORE in c:
    c = c.replace(INSERT_BEFORE, LANDING_PAGES_SLIDE + AI_VISIBILITY_SLIDE + INSERT_BEFORE, 1)
    changes += 1
    print('  ✓ Inserted Landing Pages + AI Visibility slides')
else:
    print('  ✗ NOT FOUND: insertion point for new SEO slides')

# ═══════════════════════════════════════════════════════════════
# 6. SEO WHAT WE DO NEXT (slide 42 → now 44)
#    Replace the 4 action cards with PDF-aligned priorities
# ═══════════════════════════════════════════════════════════════
print('\n═══ 6. SEO WHAT WE DO NEXT — PDF-aligned priorities ═══')

old_seo_next_content = '''      <div style="display:flex;flex-direction:column;gap:var(--gap);flex:1;justify-content:center">
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
      </div>'''

new_seo_next_content = '''      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);flex:1;min-height:0">
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm)">
          <div class="action-card anim d2" style="border-left-color:var(--ch-seo)">
            <strong>① New Landing Pages — In Progress</strong>
            <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
              <li><strong>Melbourne Business Hotels</strong> — copy in progress, targeting corporate segment</li>
              <li><strong>Elizabeth Street Hotel</strong> — copy in progress, new location content build</li>
              <li>Support with internal linking strategy on launch to accelerate indexing &amp; ranking</li>
            </ul>
          </div>
          <div class="action-card anim d3" style="border-left-color:var(--ch-seo)">
            <strong>② Re-Optimisation Review</strong>
            <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
              <li><strong>Flinders Street landing page review</strong> — only hotel page up +35% YoY; replicate its H1/H2 structure across Hardware Lane, Jones Lane &amp; Central</li>
              <li>Hardware Lane (CTR 1.60%) — structured data &amp; OG image refresh priority</li>
              <li>Central Melbourne (pos 3.4) — lift CTR from 3.96% toward 6%+</li>
            </ul>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm)">
          <div class="action-card anim d4" style="border-left-color:var(--ch-seo)">
            <strong>③ Brand SERP Defence</strong>
            <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
              <li>Audit title tags &amp; meta descriptions — brand CTR fell 9.70% → 7.03% YoY</li>
              <li>Expand Google Business Profiles (Photos, Posts, Q&amp;A) + FAQPage schema markup</li>
              <li>Target avg position back to ≤3.5 (currently 5.0) by Jul 2026</li>
            </ul>
          </div>
          <div class="action-card action anim d5">
            <strong>④ Monthly SEO Tasks</strong>
            <ul style="margin:0.4rem 0 0 1.2rem;padding:0;list-style:disc;line-height:1.7;color:var(--text)">
              <li><strong>Internal linking optimisation</strong> — content pages → hotel LPs for booking intent</li>
              <li><strong>Health check</strong> on past landing pages (4 indexed but not yet ranking)</li>
              <li><strong>Monthly technical SEO checks</strong> + fixes (Core Web Vitals, crawl errors)</li>
              <li><strong>Citation audit</strong> + <strong>backlink reclamation audit</strong></li>
            </ul>
          </div>
        </div>
      </div>'''

rep(old_seo_next_content, new_seo_next_content, 'SEO What We Do Next — PDF-aligned 2-column layout')

# ═══════════════════════════════════════════════════════════════
# 7. RENUMBER ALL SLIDES (now 44 total)
# ═══════════════════════════════════════════════════════════════
print('\n═══ 7. RENUMBERING all slides → 44 total ═══')
pattern = re.compile(r'<div class="slide-num">.*?</div>', re.DOTALL)
matches = list(pattern.finditer(c))
total = len(matches)
print(f'  Found {total} slide-num divs')

offset = 0
for i, m in enumerate(matches):
    new_text = f'<div class="slide-num">{i+1:02d} / {total}</div>'
    start = m.start() + offset
    end   = m.end()   + offset
    c = c[:start] + new_text + c[end:]
    offset += len(new_text) - (m.end() - m.start())

print(f'  ✓ Renumbered 01/{total} → {total:02d}/{total}')
changes += 1

# ═══════════════════════════════════════════════════════════════
# 8. WRITE OUTPUT
# ═══════════════════════════════════════════════════════════════
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\n✓ {changes} change groups applied. {total} slides total. File saved.')
print('Done.')
