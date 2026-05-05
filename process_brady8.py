"""
process_brady8.py
─────────────────────────────────────────────────────────────────────────────
Remove old "Group Website & Hotel Pages" slide.
Replace combined "Landing Pages Performance" slide with 6 individual LP slides.
Each LP slide exactly matches the PDF/Google Slides content with improved design.
Final slide count: 44 − 2 removed + 6 added = 48 slides.
─────────────────────────────────────────────────────────────────────────────
"""
import re

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    content = f.read()

changes = 0

def log(label):
    print(f'  ✓ {label}')

def miss(label):
    print(f'  ✗ MISS: {label}')

# ══════════════════════════════════════════════════════
# 1. REMOVE Group Website & Hotel Pages slide
# ══════════════════════════════════════════════════════
print('═══ 1. REMOVE Group Website slide ═══')
GROUP_START = '<!-- ════ 33. SEO — GROUP SITE + HOTEL PAGES (YoY) ════ -->'
GROUP_END   = '<!-- ════ 34. SEO — BRAND vs GENERIC ════ -->'
i0 = content.find(GROUP_START)
i1 = content.find(GROUP_END)
if i0 != -1 and i1 != -1:
    content = content[:i0] + content[i1:]
    changes += 1
    log('Group Website & Hotel Pages slide removed')
else:
    miss('Group Website slide not found')

# ══════════════════════════════════════════════════════
# 2. REPLACE combined Landing Pages slide with 6 individual LP slides
# ══════════════════════════════════════════════════════
print('═══ 2. INSERT 6 individual LP slides ═══')

# ── shared style helpers ────────────────────────────────────────────────────
INSIGHT_BOX = lambda emoji, heading, body: f'''
      <div class="anim d2" style="background:linear-gradient(135deg,rgba(94,63,190,0.08),rgba(94,63,190,0.03));border:1px solid rgba(94,63,190,0.18);border-radius:10px;padding:0.85rem var(--gap);margin-bottom:var(--gap-sm);display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem;flex-shrink:0">{emoji}</div>
        <div>
          <div style="font-weight:700;font-size:var(--fs-body);color:var(--ch-seo)">{heading}</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.2rem">{body}</div>
        </div>
      </div>'''

KW_TABLE_OPEN = '''
        <div class="chart-card anim d3" style="padding:var(--gap);overflow:auto">
          <div class="ch-sub">Tracked Keyword Position Movements · April 2026</div>
          <table class="dt" style="margin-top:0.6rem;width:100%;font-size:var(--fs-body)">
            <thead><tr>
              <th style="text-align:left">Keyword</th>
              <th style="text-align:center;width:88px">Previous</th>
              <th style="text-align:center;width:88px">Current</th>
              <th style="text-align:center;width:105px">Movement</th>
            </tr></thead>
            <tbody>'''

KW_TABLE_CLOSE = '''
            </tbody>
          </table>
        </div>'''

def kw_row(keyword, prev, curr, delta_label, delta_class):
    prev_html = f'<span style="color:var(--text-muted)">{prev}</span>'
    curr_html = f'<strong style="color:var(--pos);font-size:1.05em">{curr}</strong>'
    if delta_class == 'new':
        tag = f'<span style="background:rgba(94,63,190,0.13);color:var(--ch-seo);border:1px solid rgba(94,63,190,0.35);border-radius:4px;padding:0.15rem 0.5rem;font-size:var(--fs-label);font-weight:700;white-space:nowrap">★ NEW</span>'
    else:
        tag = f'<span class="ftag ftag-win">{delta_label}</span>'
    return f'''
              <tr>
                <td>{keyword}</td>
                <td style="text-align:center">{prev_html}</td>
                <td style="text-align:center">{curr_html}</td>
                <td style="text-align:center">{tag}</td>
              </tr>'''

def stat_card(label, value, sub, color='var(--pos)'):
    return f'''
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);text-align:center">
            <div style="font-size:var(--fs-label);color:var(--text-light);font-weight:600;text-transform:uppercase;margin-bottom:0.3rem">{label}</div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.9rem;color:{color};line-height:1">{value}</div>
            <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.25rem">{sub}</div>
          </div>'''

def status_card(text, color='var(--ch-seo)'):
    return f'''
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-top:3px solid {color};text-align:center">
            <div style="font-size:var(--fs-label);color:var(--text-light);font-weight:600;text-transform:uppercase;margin-bottom:0.3rem">Status</div>
            <div style="font-weight:700;font-size:var(--fs-body);color:{color}">{text}</div>
          </div>'''

def lp_slide(comment, eyebrow, title, insight, table_rows, side_cards, new_badge=False):
    badge = ''
    if new_badge:
        badge = ' <span style="background:var(--pos);color:#fff;font-size:var(--fs-label);font-weight:700;padding:0.15rem 0.55rem;border-radius:4px;vertical-align:middle;margin-left:0.5rem">NEW</span>'
    return f'''
<!-- ════ {comment} ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow seo anim d1">{eyebrow}</div>
      <h2 class="slide-title anim d2">{title}{badge}</h2>
    </div>
    <div class="slide-content">
      {insight}
      <div style="display:grid;grid-template-columns:1fr 196px;gap:var(--gap);flex:1;min-height:0">
        {table_rows}
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm)" class="anim d4">
          {side_cards}
        </div>
      </div>
    </div>
  </div>
  <div class="section-tag seo">SEO</div>
  <div class="slide-num">XX / YY</div>
</section>
'''

# ── Slide A: Marvel Stadium ──────────────────────────────────────────────────
MARVEL = lp_slide(
    comment  = 'SEO — LANDING PAGE: MARVEL STADIUM',
    eyebrow  = 'SEO · Landing Pages · April 2026 · Keyword Movements',
    title    = 'Marvel Stadium — Keyword Rankings',
    insight  = INSIGHT_BOX(
        '🏟️',
        '+2 keywords moved into page 1 rankings · First keyword breaks into top 3',
        '"marvel stadium hotels" jumped from position 7 → <strong style="color:var(--pos)">#3</strong> — '
        'a major milestone for the LP in a competitive accommodation-near-venue segment.'
    ),
    table_rows = (
        KW_TABLE_OPEN
        + kw_row('marvel stadium hotels',                    '7', '3', '↑ +4 ⭐', 'win')
        + kw_row('accommodation melbourne near marvel stadium', '8', '5', '↑ +3',   'win')
        + kw_row('hotels near marvel stadium melbourne',     '7', '6', '↑ +1',   'win')
        + kw_row('accommodation close to marvel stadium',   '9', '8', '↑ +1',   'win')
        + KW_TABLE_CLOSE
    ),
    side_cards = (
        status_card('Active')
        + stat_card('Best Position', '#3', 'marvel stadium hotels')
        + stat_card('Page 1 Terms', '4',  'All tracked terms in top 10')
    ),
)

# ── Slide B: MCEC (Convention Centre) ───────────────────────────────────────
MCEC = lp_slide(
    comment  = 'SEO — LANDING PAGE: MCEC',
    eyebrow  = 'SEO · Landing Pages · April 2026 · Keyword Movements',
    title    = 'Convention Centre (MCEC) — Keyword Rankings',
    insight  = INSIGHT_BOX(
        '🏛️',
        '+8 keywords moved into page 1 · 27 terms now ranking on first page',
        'MCEC LP continued to build strong momentum in April — '
        '27 total page 1 terms confirms significant authority in the convention accommodation niche.'
    ),
    table_rows = (
        KW_TABLE_OPEN
        + kw_row('convention centre melbourne accommodation',             'N/A', '6', '', 'new')
        + kw_row('melbourne convention centre hotels nearby',             '11',  '7', '↑ +4', 'win')
        + kw_row('accommodation near mcec melbourne',                     '8',   '7', '↑ +1', 'win')
        + kw_row('hotels near melbourne convention and exhibition centre', '10',  '9', '↑ +1', 'win')
        + KW_TABLE_CLOSE
    ),
    side_cards = (
        status_card('Active')
        + stat_card('Page 1 Total', '27', 'Terms ranking positions #1–10')
        + stat_card('This Month', '+8', 'New page 1 terms added')
    ),
)

# ── Slide C: Serviced Apartments ────────────────────────────────────────────
SERV = lp_slide(
    comment  = 'SEO — LANDING PAGE: SERVICED APARTMENTS',
    eyebrow  = 'SEO · Landing Pages · April 2026 · Keyword Movements',
    title    = 'Serviced Apartments — Keyword Rankings',
    insight  = INSIGHT_BOX(
        '🏢',
        'Improved 50% MoM · +2 keywords into page 1 · +9 onto page 2',
        'Strong month-over-month acceleration — 2 new terms break onto page 1 and 9 more move onto '
        'page 2, signalling the page is building domain authority quickly.'
    ),
    table_rows = (
        KW_TABLE_OPEN
        + kw_row('serviced apartments melbourne cbd',             '20', '11', '↑ +9', 'win')
        + kw_row('service apt in melbourne',                     'N/A', '8',  '', 'new')
        + kw_row('serviced apartments in melbourne city',         'N/A', '13', '', 'new')
        + kw_row('accommodation melbourne cbd serviced apartments','N/A', '12', '', 'new')
        + KW_TABLE_CLOSE
    ),
    side_cards = (
        status_card('Active')
        + stat_card('MoM Improvement', '+50%', 'Overall LP performance')
        + stat_card('Page 2 Terms', '+9', 'New terms entering page 2')
    ),
)

# ── Slide D: Crown Casino (NEW) ──────────────────────────────────────────────
CROWN = lp_slide(
    comment   = 'SEO — LANDING PAGE: CROWN CASINO (NEW)',
    eyebrow   = 'SEO · Landing Pages · April 2026 · New LP Launch',
    title     = 'Crown Casino — Keyword Rankings',
    new_badge = True,
    insight   = INSIGHT_BOX(
        '🎰',
        'Deployed start of April · Indexed quickly · 1 term page 1 · 8 terms page 2',
        'Crown Casino LP launched early April and indexed rapidly — excellent relevancy signal for '
        'a brand-new page. Strong foundation to build on through May with internal linking support.'
    ),
    table_rows = (
        KW_TABLE_OPEN
        + kw_row('accommodation close to crown casino melbourne',   'N/A', '10', '', 'new')
        + kw_row('melbourne cbd accommodation near crown casino',   'N/A', '11', '', 'new')
        + kw_row('hotel accommodation near crown casino melbourne', 'N/A', '13', '', 'new')
        + kw_row('melbourne accommodation near casino',             'N/A', '13', '', 'new')
        + KW_TABLE_CLOSE
    ),
    side_cards = (
        status_card('New Launch', 'var(--pos)')
        + stat_card('Deployed', 'Apr', 'Early April 2026', 'var(--ch-seo)')
        + stat_card('Page 1 Terms', '1', '+ 8 on page 2')
    ),
)

# ── Slide E: Princes Theater (NEW) ──────────────────────────────────────────
PRINCES = lp_slide(
    comment   = 'SEO — LANDING PAGE: PRINCES THEATER (NEW)',
    eyebrow   = 'SEO · Landing Pages · April 2026 · New LP Launch',
    title     = 'Princes Theater — Keyword Rankings',
    new_badge = True,
    insight   = INSIGHT_BOX(
        '🎭',
        'Indexed late April · 2 target terms ranking on lower page 1 from day one',
        'Princes Theater LP started getting indexed in late April and immediately ranks for '
        '2 target terms on page 1 — strong early relevancy signal for a page only days old.'
    ),
    table_rows = (
        KW_TABLE_OPEN
        + kw_row('accommodation near princess theatre',            'N/A', '8',  '', 'new')
        + kw_row('best hotels near princess theatre melbourne',    'N/A', '10', '', 'new')
        + KW_TABLE_CLOSE
    ),
    side_cards = (
        status_card('New Launch', 'var(--pos)')
        + stat_card('Deployed', 'Late Apr', 'April 2026', 'var(--ch-seo)')
        + stat_card('Page 1 Terms', '2', 'From day one of indexing')
    ),
)

# ── Slide F: Other recently launched LPs ─────────────────────────────────────
OTHER_LPS = '''
<!-- ════ SEO — OTHER RECENTLY LAUNCHED LPs ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow seo anim d1">SEO · Landing Pages · April 2026 · In Progress</div>
      <h2 class="slide-title anim d2">Other Recently Launched Landing Pages</h2>
    </div>
    <div class="slide-content">
      <div class="anim d2" style="background:linear-gradient(135deg,rgba(94,63,190,0.08),rgba(94,63,190,0.03));border:1px solid rgba(94,63,190,0.18);border-radius:10px;padding:0.85rem var(--gap);margin-bottom:var(--gap);display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem;flex-shrink:0">🔍</div>
        <div>
          <div style="font-weight:700;font-size:var(--fs-body);color:var(--ch-seo)">All 4 pages indexed — not yet ranking for target keywords</div>
          <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.2rem">We are monitoring these recently launched landing pages. To support performance we will implement an <strong>internal linking optimisation strategy</strong> to improve discoverability and strengthen semantic relevance, helping these pages gain traction in search results.</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);flex:1;min-height:0">
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm)" class="anim d3">
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-left:4px solid var(--ch-seo);display:flex;align-items:center;gap:0.8rem">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">📍</div>
            <div>
              <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Queen Victoria Market</div>
              <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.1rem">/accommodation-near-queen-victoria-market/</div>
              <div style="font-size:var(--fs-label);color:var(--text-light);margin-top:0.15rem">Indexed · Monitoring</div>
            </div>
          </div>
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-left:4px solid var(--ch-seo);display:flex;align-items:center;gap:0.8rem">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">🎭</div>
            <div>
              <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Regent Theatre</div>
              <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.1rem">/hotels-near-regent-theatre-melbourne/</div>
              <div style="font-size:var(--fs-label);color:var(--text-light);margin-top:0.15rem">Indexed · Monitoring</div>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm)" class="anim d4">
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-left:4px solid var(--ch-seo);display:flex;align-items:center;gap:0.8rem">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">⭐</div>
            <div>
              <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Four Star Hotels Melbourne</div>
              <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.1rem">/four-star-hotels-melbourne/</div>
              <div style="font-size:var(--fs-label);color:var(--text-light);margin-top:0.15rem">Indexed · Monitoring</div>
            </div>
          </div>
          <div style="background:var(--bg-soft);border-radius:10px;padding:var(--gap-sm);border-left:4px solid var(--ch-seo);display:flex;align-items:center;gap:0.8rem">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(94,63,190,0.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">🏨</div>
            <div>
              <div style="font-weight:700;font-size:var(--fs-body);color:var(--text)">Apartment Hotels Melbourne</div>
              <div style="font-size:var(--fs-small);color:var(--text-muted);margin-top:0.1rem">/apartment-hotels-melbourne/</div>
              <div style="font-size:var(--fs-label);color:var(--text-light);margin-top:0.15rem">Indexed · Monitoring</div>
            </div>
          </div>
        </div>
      </div>
      <div class="action-card anim d5" style="margin-top:var(--gap-sm);border-left-color:var(--ch-seo)">
        <strong>Next action:</strong> Internal linking optimisation strategy — connect existing high-authority pages to these new LPs to accelerate indexing signals, strengthen semantic relevance and push these pages into page 1 rankings in May/June.
      </div>
    </div>
  </div>
  <div class="section-tag seo">SEO</div>
  <div class="slide-num">XX / YY</div>
</section>
'''

ALL_NEW_LP_SLIDES = MARVEL + MCEC + SERV + CROWN + PRINCES + OTHER_LPS

# Find and replace the combined LP slide
LP_OLD_START = '<!-- ════ NEW. SEO — LANDING PAGES PERFORMANCE ════ -->'
LP_OLD_END   = '<!-- ════ NEW. SEO — AI VISIBILITY ════ -->'
j0 = content.find(LP_OLD_START)
j1 = content.find(LP_OLD_END)
if j0 != -1 and j1 != -1:
    content = content[:j0] + ALL_NEW_LP_SLIDES + content[j1:]
    changes += 1
    log('Combined LP slide → 6 individual LP slides')
else:
    miss('Combined Landing Pages slide not found')

# ══════════════════════════════════════════════════════
# 3. RENUMBER all slides → 48 total
# ══════════════════════════════════════════════════════
print('═══ 3. RENUMBERING slides ═══')
pattern = re.compile(r'<div class="slide-num">.*?</div>', re.DOTALL)
matches = list(pattern.finditer(content))
total   = len(matches)
print(f'  Found {total} slide-num divs')

# Rebuild string with new numbers
result = []
prev_end = 0
for i, m in enumerate(matches, 1):
    result.append(content[prev_end:m.start()])
    result.append(f'<div class="slide-num">{i:02d} / {total:02d}</div>')
    prev_end = m.end()
result.append(content[prev_end:])
content = ''.join(result)
changes += 1
log(f'Renumbered 01/{total:02d} → {total:02d}/{total:02d}')

# ══════════════════════════════════════════════════════
# Save
# ══════════════════════════════════════════════════════
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n✓ {changes} change groups applied. {total} slides total. File saved.')
print('Done.')
