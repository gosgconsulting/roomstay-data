"""
generate_scripts_sql.py
─────────────────────────────────────────────────────────────────────────────
Reads NOTES from brady-april-2026-hybrid.html and writes INSERT SQL
for the presentation_scripts table (Supabase / PostgreSQL).
─────────────────────────────────────────────────────────────────────────────
"""
import re, json

SRC = 'public/slides/brady-april-2026-hybrid.html'
OUT = 'scripts_insert.sql'

ACCOUNT_ID      = '3998a594-c07c-46b2-937d-fe477b6e9ce7'
REPORT_ID       = '0fde479a-850e-4733-b79e-5e3a97c075ac'
REPORT_NAME     = 'Brady Hotels x Dijitally — Combined Report'
REPORT_PERIOD   = 'April 2026'

# ── Slide metadata ─────────────────────────────────────────────────────────
SLIDES = {
    1:  ('April 2026 Performance Overview',       'Overview',         ['overview','cover','intro','april-2026']),
    2:  ('Report Agenda',                          'Overview',         ['overview','agenda','structure']),
    3:  ('Portfolio Overview — Section Cover',     'Overview',         ['overview','section-cover','portfolio']),
    4:  ('Portfolio at a Glance',                  'Overview',         ['overview','portfolio','hotels','adr','rooms']),
    5:  ('April 2026 — All Channels Combined',     'Overview',         ['overview','april-2026','all-channels','roas']),
    6:  ('Channel Mix & Revenue Distribution',     'Overview',         ['overview','channel-mix','roas','revenue']),
    7:  ('YTD January–April 2026',                 'Overview',         ['overview','ytd','jan-apr','full-year']),
    8:  ('SEM — Section Cover',                    'SEM',              ['sem','section-cover','google-ads']),
    9:  ('SEM Funnel Framework',                   'SEM',              ['sem','funnel','brand','generic','pmax']),
    10: ('SEM Performance by Hotel',               'SEM',              ['sem','by-hotel','roas','cpc','google-ads']),
    11: ('SEM Breakdowns — Device & Market',       'SEM',              ['sem','device','international','tablet','singapore']),
    12: ('SEM Budget Reallocation & Action Plan',  'SEM',              ['sem','action-plan','pmax','budget','may-2026']),
    13: ('SEM Year-to-Date Performance',           'SEM',              ['sem','ytd','jan-apr','2025-comparison','afl']),
    14: ('Creative Asset Brief',                   'SEM',              ['sem','creative','pmax','video','assets','afl']),
    15: ('SEM Monthly Forecast 2026',              'SEM',              ['sem','forecast','2026','events','afl','may']),
    16: ('Metasearch — Section Cover',             'Metasearch',       ['metasearch','section-cover']),
    17: ('How Metasearch Works',                   'Metasearch',       ['metasearch','funnel','rate','reviews','tripadvisor']),
    18: ('Metasearch Performance by Hotel',        'Metasearch',       ['metasearch','by-hotel','roas','aov','conversion']),
    19: ('Channel Split & Free Booking Links',     'Metasearch',       ['metasearch','google-hotel-ads','tripadvisor','free-links']),
    20: ('Bidding Strategy & Recommendations',     'Metasearch',       ['metasearch','bidding','cpc','flinders','jones-lane']),
    21: ('Metasearch Year-to-Date',                'Metasearch',       ['metasearch','ytd','2025-comparison','mcec']),
    22: ('Metasearch Forecast 2026',               'Metasearch',       ['metasearch','forecast','2026','afl','september']),
    23: ('Social — Section Cover',                 'Social',           ['social','section-cover','meta','facebook','instagram']),
    24: ('Social Funnel Architecture',             'Social',           ['social','funnel','awareness','remarketing','lookalike']),
    25: ('Social Performance by Hotel',            'Social',           ['social','by-hotel','roas','jones-lane','central']),
    26: ('Audience & Device Analysis',             'Social',           ['social','audience','demographics','mobile','device']),
    27: ('Membership Campaign Performance',        'Social',           ['social','membership','cpl','crm','leads']),
    28: ('Social Action Plan',                     'Social',           ['social','action-plan','creative','may-2026','group']),
    29: ('Social Year-to-Date',                    'Social',           ['social','ytd','jan-apr','2025-comparison','algorithm']),
    30: ('Creative Performance Analysis',          'Social',           ['social','creative','ugc','video','ctr','reels']),
    31: ('Social Monthly Forecast 2026',           'Social',           ['social','forecast','2026','school-holidays','july']),
    32: ('Creative Before & After',                'Social',           ['social','creative','before-after','ctr','saver-rate']),
    33: ('What We Do Next — Paid Channels',        'Action Plan',      ['action-plan','paid','sem','metasearch','social','may-2026']),
    34: ('SEO — Section Cover',                    'SEO',              ['seo','section-cover','organic']),
    35: ('Brand vs Generic Traffic',               'SEO',              ['seo','brand','generic','ctr','impressions','ai-overview']),
    36: ('Organic Sessions Year-on-Year',          'SEO',              ['seo','sessions','yoy','2025-comparison','landing-pages']),
    37: ('GA4 Organic Revenue',                    'SEO',              ['seo','ga4','revenue','cvr','conversion','brand-queries']),
    38: ('Marvel Stadium Landing Page',            'SEO',              ['seo','landing-page','marvel-stadium','rankings','position-3']),
    39: ('MCEC Landing Page',                      'SEO',              ['seo','landing-page','mcec','convention','page-1','27-terms']),
    40: ('Serviced Apartments Landing Page',       'SEO',              ['seo','landing-page','serviced-apartments','mom-growth','page-2-to-1']),
    41: ('Crown Casino Landing Page',              'SEO',              ['seo','landing-page','crown-casino','new-page','internal-linking']),
    42: ('Princes Theater Landing Page',           'SEO',              ['seo','landing-page','princes-theater','new-page','page-1']),
    43: ('Other Landing Pages',                    'SEO',              ['seo','landing-pages','indexed','queen-victoria','regent','internal-linking']),
    44: ('AI Visibility & Search',                 'SEO',              ['seo','ai','chatgpt','ai-overview','perplexity','citations']),
    45: ('What We Do Next — SEO',                  'Action Plan',      ['action-plan','seo','landing-pages','brand-serp','may-2026']),
    46: ('Full Year Results — 2026',               'Full Year',        ['full-year','cover','results','2026']),
    47: ('Full Year P&L 2026',                     'Full Year',        ['full-year','pl','forecast','roi','afl','q3']),
    48: ('Forecast per Hotel × Channel',           'Full Year',        ['full-year','forecast','by-hotel','by-channel','roas']),
}

# ── Extract NOTES from HTML ────────────────────────────────────────────────
print('Reading HTML...')
with open(SRC, encoding='utf-8') as f:
    html = f.read()

# Find the NOTES object: from "var NOTES = {" to the closing "};"
start = html.find('  var NOTES = {')
end   = html.find('\n};', start) + 3   # include "};"
notes_block = html[start:end]

# Parse each entry: lines like "  N: "text","
NOTES = {}
# Match:  N: "...",  (where text may span multiple lines — it doesn't here)
pattern = re.compile(r'^\s+(\d+):\s+"(.*?)",?\s*$', re.MULTILINE)
for m in pattern.finditer(notes_block):
    num  = int(m.group(1))
    text = m.group(2)
    # Unescape JS string sequences
    text = text.replace('\\n', '\n')
    text = text.replace('\\"', '"')
    text = text.replace('\\\\', '\\')
    NOTES[num] = text

print(f'  Found {len(NOTES)} notes.')

# ── Build SQL ──────────────────────────────────────────────────────────────
def pg_literal(s):
    """Dollar-quote a string using unique tag to avoid conflicts."""
    tag = '$SCRIPT$'
    # If text contains our tag, fall back to single-quote escaping
    if tag in s:
        return "'" + s.replace("'", "''") + "'"
    return tag + s + tag

def pg_array(tags):
    """Build a PostgreSQL text array literal."""
    escaped = ["'" + t.replace("'", "''") + "'" for t in tags]
    return 'ARRAY[' + ', '.join(escaped) + ']'

lines = []
lines.append('-- Brady Hotels × Dijitally — April 2026 Speaker Scripts')
lines.append('-- 48 slides → presentation_scripts table')
lines.append('-- Generated by generate_scripts_sql.py')
lines.append('')
lines.append('INSERT INTO public.presentation_scripts')
lines.append('  (account_id, slide_report_id, report_name, report_period,')
lines.append('   slide_number, slide_title, section, script, tags)')
lines.append('VALUES')

rows = []
for num in range(1, 49):
    title, section, tags = SLIDES[num]
    script_text = NOTES.get(num, '')
    row = (
        f"  ('{ACCOUNT_ID}', '{REPORT_ID}',\n"
        f"   {pg_literal(REPORT_NAME)}, {pg_literal(REPORT_PERIOD)},\n"
        f"   {num}, {pg_literal(title)}, {pg_literal(section)},\n"
        f"   {pg_literal(script_text)},\n"
        f"   {pg_array(tags)})"
    )
    rows.append(row)

lines.append(',\n'.join(rows))
lines.append(';')

sql = '\n'.join(lines)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(sql)

print(f'  Written to {OUT} ({len(sql):,} bytes, {len(rows)} rows)')
print('Done.')
