"""
process_brady9.py
─────────────────────────────────────────────────────────────────────────────
Reorder slides:
  1. Move "What We Do Next — Paid Channels" → after last Social slide (before SEO)
  2. Move "What We Do Next — SEO" → after AI Visibility (before Full Year section)
  3. Rename "Action Plan" section divider → "Full Year Results" cover
  4. Renumber all slides (total stays 48)
─────────────────────────────────────────────────────────────────────────────
"""
import re

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    content = f.read()

# ── KEY ANCHOR STRINGS ────────────────────────────────────────────────────────
SEO_DIVIDER    = '<!-- ════ 32. SECTION DIVIDER SEO ════ -->'
AI_VIS_END_TAG = '<!-- ════ NEW. SEO — AI VISIBILITY ════ -->'   # use to find slide end
AP_DIVIDER     = '<!-- ════ 37. SECTION DIVIDER ACTION PLAN ════ -->'
PL_COMMENT     = '<!-- ════ 32. FULL YEAR FORECAST 2026 -->'
FORECAST_COM   = '<!-- ════ 33. FORECAST PER HOTEL \xd7 CHANNEL MATRIX -->'
PAID_WDN_COM   = '<!-- ════ 34. CLOSING — TOP 5 PRIORITIES ════ -->'
SEO_WDN_COM    = '<!-- ════ SEO — WHAT WE DO NEXT ════ -->'

# ── EXTRACT each piece ────────────────────────────────────────────────────────
print('═══ Locating slide boundaries ═══')

# 1. Paid WDN slide: from PAID_WDN_COM up to (not including) SEO_WDN_COM
pos_paid_start = content.find(PAID_WDN_COM)
pos_seo_wdn    = content.find(SEO_WDN_COM)
paid_wdn_html  = content[pos_paid_start:pos_seo_wdn]
print(f'  Paid WDN: chars {pos_paid_start}–{pos_seo_wdn} ({len(paid_wdn_html)} bytes)')

# 2. SEO WDN slide: from SEO_WDN_COM to its closing </section>
pos_seo_wdn_end = content.find('</section>', pos_seo_wdn) + len('</section>') + 1  # +1 for newline
seo_wdn_html    = content[pos_seo_wdn:pos_seo_wdn_end]
print(f'  SEO  WDN: chars {pos_seo_wdn}–{pos_seo_wdn_end} ({len(seo_wdn_html)} bytes)')

# 3. AP divider slide: from AP_DIVIDER to PL_COMMENT
pos_ap     = content.find(AP_DIVIDER)
pos_pl     = content.find(PL_COMMENT)
ap_div_html = content[pos_ap:pos_pl]
print(f'  AP divider: chars {pos_ap}–{pos_pl} ({len(ap_div_html)} bytes)')

# 4. The 2 data slides: from PL_COMMENT up to (not including) PAID_WDN_COM
two_data_html = content[pos_pl:pos_paid_start]
print(f'  2 data slides: chars {pos_pl}–{pos_paid_start} ({len(two_data_html)} bytes)')

# 5. Everything after SEO WDN slide (body close + scripts)
suffix = content[pos_seo_wdn_end:]
print(f'  Suffix (scripts+close): {len(suffix)} bytes')

# ── BUILD FULL YEAR RESULTS DIVIDER ───────────────────────────────────────────
# Update the Action Plan divider content to become "Full Year Results"
fy_cover_html = ap_div_html.replace(
    'Section Six \xb7 Priorities', 'Full Year Results \xb7 2026'
).replace(
    '<div class="sd-title anim d3">What We Do Next</div>',
    '<div class="sd-title anim d3">Full Year Results</div>'
).replace(
    '<div class="sd-sub anim d4">Paid channels and SEO — May 2026 next steps and execution priorities.</div>',
    '<div class="sd-sub anim d4">Jan–Dec 2026 · Full year P&amp;L, forecast per hotel &amp; channel, and projected ROI.</div>'
).replace(
    '<!-- ════ 37. SECTION DIVIDER ACTION PLAN ════ -->',
    '<!-- ════ FULL YEAR RESULTS SECTION DIVIDER ════ -->'
)
print()
print('═══ Full Year Results cover updated ═══')
print('  ✓ Divider text updated to "Full Year Results"')

# ── REBUILD THE DECK ──────────────────────────────────────────────────────────
print()
print('═══ Rebuilding slide order ═══')

# Segments:
# A: Everything from start up to (not including) SEO divider  →  slides 1–32 (Social included)
pos_seo_div = content.find(SEO_DIVIDER)
part_a = content[:pos_seo_div]         # slides 01–32

# B: SEO section: from SEO_DIVIDER up to (not including) AP_DIVIDER  →  slides 33–43
part_b = content[pos_seo_div:pos_ap]  # SEO divider + 10 SEO slides

# Find end of AI Visibility </section> so SEO WDN goes right after it
ai_vis_pos = part_b.rfind('</section>')
if ai_vis_pos != -1:
    ai_vis_end = ai_vis_pos + len('</section>') + 1
    part_b_before_wdn = part_b[:ai_vis_end]
    part_b_after_wdn  = part_b[ai_vis_end:]
else:
    part_b_before_wdn = part_b
    part_b_after_wdn  = ''

# Assemble new content:
new_content = (
    part_a                +   # 01–32: Cover → … → Social Forecast
    '\n' + paid_wdn_html +    # NEW 33: What We Do Next — Paid Channels
    part_b_before_wdn     +   # 34–44: SEO Divider → … → AI Visibility
    '\n' + seo_wdn_html   +   # NEW 45: What We Do Next — SEO
    fy_cover_html          +  # 46: Full Year Results cover
    two_data_html          +  # 47: Full Year P&L · 48: Forecast per Hotel
    suffix                     # </body> + scripts
)

print('  ✓ Paid WDN → after Social (before SEO divider)')
print('  ✓ SEO WDN → after AI Visibility')
print('  ✓ Full Year Results cover → after SEO WDN')
print('  ✓ Full Year P&L + Forecast per Hotel → last 2 slides')

# ── RENUMBER ─────────────────────────────────────────────────────────────────
print()
print('═══ Renumbering slides ═══')

pattern = re.compile(r'<div class="slide-num">.*?</div>', re.DOTALL)
matches = list(pattern.finditer(new_content))
total   = len(matches)
print(f'  Found {total} slide-num divs')

result   = []
prev_end = 0
for i, m in enumerate(matches, 1):
    result.append(new_content[prev_end:m.start()])
    result.append(f'<div class="slide-num">{i:02d} / {total:02d}</div>')
    prev_end = m.end()
result.append(new_content[prev_end:])
new_content = ''.join(result)

print(f'  ✓ Renumbered 01/{total:02d} → {total:02d}/{total:02d}')

# ── SAVE ─────────────────────────────────────────────────────────────────────
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'\n✓ Done. {total} slides. File saved.')
