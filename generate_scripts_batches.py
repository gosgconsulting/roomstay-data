"""
generate_scripts_batches.py
─────────────────────────────────────────────────────────────────────────────
Reads NOTES from HTML and writes 4 batch INSERT SQL files.
─────────────────────────────────────────────────────────────────────────────
"""
import re

SRC = 'public/slides/brady-april-2026-hybrid.html'

ACCOUNT_ID    = '3998a594-c07c-46b2-937d-fe477b6e9ce7'
REPORT_ID     = '0fde479a-850e-4733-b79e-5e3a97c075ac'
REPORT_NAME   = 'Brady Hotels x Dijitally — Combined Report'
REPORT_PERIOD = 'April 2026'

SLIDES = {
    1:  ('April 2026 Performance Overview',      'Overview',    ['overview','cover','intro','april-2026']),
    2:  ('Report Agenda',                         'Overview',    ['overview','agenda','structure']),
    3:  ('Portfolio Overview — Section Cover',    'Overview',    ['overview','section-cover','portfolio']),
    4:  ('Portfolio at a Glance',                 'Overview',    ['overview','portfolio','hotels','adr','rooms']),
    5:  ('April 2026 — All Channels Combined',    'Overview',    ['overview','april-2026','all-channels','roas']),
    6:  ('Channel Mix & Revenue Distribution',    'Overview',    ['overview','channel-mix','roas','revenue']),
    7:  ('YTD January–April 2026',                'Overview',    ['overview','ytd','jan-apr','full-year']),
    8:  ('SEM — Section Cover',                   'SEM',         ['sem','section-cover','google-ads']),
    9:  ('SEM Funnel Framework',                  'SEM',         ['sem','funnel','brand','generic','pmax']),
    10: ('SEM Performance by Hotel',              'SEM',         ['sem','by-hotel','roas','cpc','google-ads']),
    11: ('SEM Breakdowns — Device & Market',      'SEM',         ['sem','device','international','tablet','singapore']),
    12: ('SEM Budget Reallocation & Action Plan', 'SEM',         ['sem','action-plan','pmax','budget','may-2026']),
    13: ('SEM Year-to-Date Performance',          'SEM',         ['sem','ytd','jan-apr','2025-comparison','afl']),
    14: ('Creative Asset Brief',                  'SEM',         ['sem','creative','pmax','video','assets','afl']),
    15: ('SEM Monthly Forecast 2026',             'SEM',         ['sem','forecast','2026','events','afl','may']),
    16: ('Metasearch — Section Cover',            'Metasearch',  ['metasearch','section-cover']),
    17: ('How Metasearch Works',                  'Metasearch',  ['metasearch','funnel','rate','reviews','tripadvisor']),
    18: ('Metasearch Performance by Hotel',       'Metasearch',  ['metasearch','by-hotel','roas','aov','conversion']),
    19: ('Channel Split & Free Booking Links',    'Metasearch',  ['metasearch','google-hotel-ads','tripadvisor','free-links']),
    20: ('Bidding Strategy & Recommendations',    'Metasearch',  ['metasearch','bidding','cpc','flinders','jones-lane']),
    21: ('Metasearch Year-to-Date',               'Metasearch',  ['metasearch','ytd','2025-comparison','mcec']),
    22: ('Metasearch Forecast 2026',              'Metasearch',  ['metasearch','forecast','2026','afl','september']),
    23: ('Social — Section Cover',                'Social',      ['social','section-cover','meta','facebook','instagram']),
    24: ('Social Funnel Architecture',            'Social',      ['social','funnel','awareness','remarketing','lookalike']),
    25: ('Social Performance by Hotel',           'Social',      ['social','by-hotel','roas','jones-lane','central']),
    26: ('Audience & Device Analysis',            'Social',      ['social','audience','demographics','mobile','device']),
    27: ('Membership Campaign Performance',       'Social',      ['social','membership','cpl','crm','leads']),
    28: ('Social Action Plan',                    'Social',      ['social','action-plan','creative','may-2026','group']),
    29: ('Social Year-to-Date',                   'Social',      ['social','ytd','jan-apr','2025-comparison','algorithm']),
    30: ('Creative Performance Analysis',         'Social',      ['social','creative','ugc','video','ctr','reels']),
    31: ('Social Monthly Forecast 2026',          'Social',      ['social','forecast','2026','school-holidays','july']),
    32: ('Creative Before & After',               'Social',      ['social','creative','before-after','ctr','saver-rate']),
    33: ('What We Do Next — Paid Channels',       'Action Plan', ['action-plan','paid','sem','metasearch','social','may-2026']),
    34: ('SEO — Section Cover',                   'SEO',         ['seo','section-cover','organic']),
    35: ('Brand vs Generic Traffic',              'SEO',         ['seo','brand','generic','ctr','impressions','ai-overview']),
    36: ('Organic Sessions Year-on-Year',         'SEO',         ['seo','sessions','yoy','2025-comparison','landing-pages']),
    37: ('GA4 Organic Revenue',                   'SEO',         ['seo','ga4','revenue','cvr','conversion','brand-queries']),
    38: ('Marvel Stadium Landing Page',           'SEO',         ['seo','landing-page','marvel-stadium','rankings','position-3']),
    39: ('MCEC Landing Page',                     'SEO',         ['seo','landing-page','mcec','convention','page-1','27-terms']),
    40: ('Serviced Apartments Landing Page',      'SEO',         ['seo','landing-page','serviced-apartments','mom-growth','page-2-to-1']),
    41: ('Crown Casino Landing Page',             'SEO',         ['seo','landing-page','crown-casino','new-page','internal-linking']),
    42: ('Princes Theater Landing Page',          'SEO',         ['seo','landing-page','princes-theater','new-page','page-1']),
    43: ('Other Landing Pages',                   'SEO',         ['seo','landing-pages','indexed','queen-victoria','regent','internal-linking']),
    44: ('AI Visibility & Search',                'SEO',         ['seo','ai','chatgpt','ai-overview','perplexity','citations']),
    45: ('What We Do Next — SEO',                 'Action Plan', ['action-plan','seo','landing-pages','brand-serp','may-2026']),
    46: ('Full Year Results — 2026',              'Full Year',   ['full-year','cover','results','2026']),
    47: ('Full Year P&L 2026',                    'Full Year',   ['full-year','pl','forecast','roi','afl','q3']),
    48: ('Forecast per Hotel × Channel',          'Full Year',   ['full-year','forecast','by-hotel','by-channel','roas']),
}

BATCHES = [
    (1, 12),   # batch1: Overview + SEM first half
    (13, 24),  # batch2: SEM end + Metasearch
    (25, 36),  # batch3: Social + Paid WDN + SEO start
    (37, 48),  # batch4: SEO LPs + Action Plan + Full Year
]

# ── Extract NOTES ──────────────────────────────────────────────────────────
with open(SRC, encoding='utf-8') as f:
    html = f.read()

start = html.find('  var NOTES = {')
end   = html.find('\n};', start) + 3
notes_block = html[start:end]

NOTES = {}
pattern = re.compile(r'^\s+(\d+):\s+"(.*?)",?\s*$', re.MULTILINE)
for m in pattern.finditer(notes_block):
    num  = int(m.group(1))
    text = m.group(2)
    text = text.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')
    NOTES[num] = text

print(f'Extracted {len(NOTES)} notes.')

# ── Helpers ────────────────────────────────────────────────────────────────
def q(s):
    """Dollar-quote a string."""
    return '$S$' + s + '$S$'

def arr(tags):
    return 'ARRAY[' + ', '.join("'" + t + "'" for t in tags) + ']'

# ── Write batches ──────────────────────────────────────────────────────────
for i, (lo, hi) in enumerate(BATCHES, 1):
    rows = []
    for num in range(lo, hi + 1):
        title, section, tags = SLIDES[num]
        script = NOTES.get(num, '')
        rows.append(
            f"  ('{ACCOUNT_ID}', '{REPORT_ID}',\n"
            f"   {q(REPORT_NAME)}, {q(REPORT_PERIOD)},\n"
            f"   {num}, {q(title)}, {q(section)},\n"
            f"   {q(script)},\n"
            f"   {arr(tags)})"
        )

    sql = (
        f"-- Batch {i}: slides {lo}–{hi}\n"
        "INSERT INTO public.presentation_scripts\n"
        "  (account_id, slide_report_id, report_name, report_period,\n"
        "   slide_number, slide_title, section, script, tags)\n"
        "VALUES\n"
        + ',\n'.join(rows)
        + '\n;'
    )

    fname = f'batch{i}.sql'
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f'  batch{i}.sql — slides {lo}–{hi}, {len(sql):,} bytes')

print('All batches written.')
