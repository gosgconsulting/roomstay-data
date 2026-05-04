#!/usr/bin/env python3
"""Brady slides v6 – Full April 2026 data update across all channels.

Fresh Windsor.ai data (full Apr 1–30 2026):
  SEM  (Google Ads 531-412-3392): $7,542 spend · $211,757 rev · 28.1× ROAS · 424 bookings
  Social (Facebook 871201710135998): $5,452 spend · $102,972 rev · 18.9× ROAS · 205 bookings
  Metasearch: no Windsor connector – per-hotel data retained, section divider unchanged

SEM Per Hotel (full April):
  Hardware Lane : $1,499 spend · $45,515 rev · 30.4× ROAS · 3.3% CoS · 77.3 conv · 1,648 clicks
  Flinders Street: $1,072 spend · $34,580 rev · 32.3× ROAS · 3.1% CoS · 62.3 conv · 1,896 clicks
  Central Melbourne: $1,592 spend · $49,551 rev · 31.1× ROAS · 3.2% CoS · 98.3 conv · 2,107 clicks
  Jones Lane : $1,229 spend · $33,591 rev · 27.3× ROAS · 3.7% CoS · 91.6 conv · 1,302 clicks
  Group (cross-portfolio): $2,150 spend · $48,520 rev · 22.6× ROAS · 4.4% CoS · 94.4 conv · 4,768 clicks

Combined Per Hotel (SEM + Social + Metasearch):
  Central Melbourne : $2,891 spend · $72,179 rev · 25.0× ROAS · 4.0% CoS · 149 bookings
  Hardware Lane     : $3,087 spend · $86,061 rev · 27.9× ROAS · 3.6% CoS · 151 bookings
  Flinders Street   : $2,588 spend · $65,933 rev · 25.5× ROAS · 3.9% CoS · 124 bookings
  Jones Lane        : $2,458 spend · $67,180 rev · 27.3× ROAS · 3.7% CoS · 170 bookings
  Group             : $3,613 spend · $77,000 rev · 21.3× ROAS · 4.7% CoS · 145 bookings
  TOTAL             : $14,637 spend · $368,353 rev · 25.2× ROAS · 4.0% CoS · 739 bookings

Social Section Divider: $5,452 spend · 402K impressions · 6,382 clicks
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FILE = 'public/slides/brady-april-2026-hybrid.html'

with open(FILE, 'r', encoding='utf-8') as f:
    c = f.read()

changes = 0

def rep(old, new, label):
    global c, changes
    if old in c:
        c = c.replace(old, new)
        changes += 1
        print(f'  ✓ {label}')
    else:
        print(f'  ✗ NOT FOUND: {label}')

print('\n═══ 1. RESULTS PER HOTEL (slide 05) ═══')

rep(
    '          <tr><td>Brady Hotels Central Melbourne</td><td>$2,746</td><td>$58,033</td><td class="pos">21.1×</td><td class="pos">4.7%</td><td>67</td><td>2,604</td><td>140K</td></tr>\n          <tr><td>Brady Apt Hotel Hardware Lane</td><td>$2,917</td><td>$56,888</td><td class="pos">19.5×</td><td class="pos">5.1%</td><td>53</td><td>2,049</td><td>121K</td></tr>\n          <tr><td>Brady Apt Hotel Flinders Street</td><td>$2,475</td><td>$39,243</td><td>15.9×</td><td>6.3%</td><td>43</td><td>2,154</td><td>137K</td></tr>\n          <tr><td>Brady Hotels Jones Lane</td><td>$2,317</td><td>$38,406</td><td>16.6×</td><td>6.0%</td><td>50</td><td>2,025</td><td>114K</td></tr>\n          <tr><td>Brady Group (cross-portfolio)</td><td>$2,907</td><td>$25,989</td><td class="neg">8.9×</td><td class="neg">11.2%</td><td>57</td><td>5,505</td><td>284K</td></tr>',
    '          <tr><td>Brady Hotels Central Melbourne</td><td>$2,891</td><td>$72,179</td><td class="pos">25.0×</td><td class="pos">4.0%</td><td>149</td><td>3,393</td><td>149K</td></tr>\n          <tr><td>Brady Apt Hotel Hardware Lane</td><td>$3,087</td><td>$86,061</td><td class="pos">27.9×</td><td class="pos">3.6%</td><td>151</td><td>3,540</td><td>153K</td></tr>\n          <tr><td>Brady Apt Hotel Flinders Street</td><td>$2,588</td><td>$65,933</td><td class="pos">25.5×</td><td class="pos">3.9%</td><td>124</td><td>3,562</td><td>180K</td></tr>\n          <tr><td>Brady Hotels Jones Lane</td><td>$2,458</td><td>$67,180</td><td class="pos">27.3×</td><td class="pos">3.7%</td><td>170</td><td>2,832</td><td>132K</td></tr>\n          <tr><td>Brady Group (cross-portfolio)</td><td>$3,613</td><td>$77,000</td><td class="pos">21.3×</td><td class="pos">4.7%</td><td>145</td><td>6,608</td><td>399K</td></tr>',
    'Results per Hotel — all 5 rows'
)

rep(
    '          <td>Total</td><td>$13,362</td><td>$218,559</td><td>16.4×</td><td>6.1%</td><td>270</td><td>14,337</td><td>796K</td>',
    '          <td>Total</td><td>$14,637</td><td>$368,353</td><td class="pos">25.2×</td><td class="pos">4.0%</td><td>739</td><td>19,935</td><td>1.0M</td>',
    'Results per Hotel — total row'
)

rep(
    '        <strong>Top revenue + ROAS:</strong> Brady Central (21.1×) + Hardware Lane (19.5×) drive over half of revenue. <strong>Brady Group cross-portfolio</strong> at 8.9× drags blended down — needs reallocation to hotel-specific PMAX.',
    '        <strong>Top revenue:</strong> Hardware Lane $86K (27.9×) + Central $72K (25.0×) lead all hotels. All hotels 21–28× ROAS across SEM + Social + Metasearch. Blended <strong>25.2× ROAS</strong> on $14.6K spend → $368K revenue.',
    'Results per Hotel — action card'
)

print('\n═══ 2. CHANNEL MIX (slide 06) ═══')

rep(
    '<td>$7,542</td><td>$199K</td><td class="pos">26.3×</td><td class="pos">3.8%</td><td>11,721</td><td>402</td>',
    '<td>$7,542</td><td>$212K</td><td class="pos">28.1×</td><td class="pos">3.6%</td><td>11,721</td><td>424</td>',
    'Channel Mix — SEM row'
)

rep(
    '<td>Total</td><td>$14,744</td><td>$366K</td><td>24.8×</td><td>4.0%</td><td>19,935</td><td>718</td>',
    '<td>Total</td><td>$14,744</td><td>$379K</td><td class="pos">25.7×</td><td class="pos">3.9%</td><td>19,935</td><td>740</td>',
    'Channel Mix — total row'
)

rep(
    '<div class="ch-title">SEM 54% · Social 28%</div>',
    '<div class="ch-title">SEM 56% · Social 27%</div>',
    'Channel Mix — revenue donut title'
)

rep(
    'background:conic-gradient(var(--ch-sem) 0% 54.3%,var(--ch-meta) 54.3% 71.8%,var(--ch-social) 71.8% 100%)',
    'background:conic-gradient(var(--ch-sem) 0% 55.9%,var(--ch-meta) 55.9% 72.8%,var(--ch-social) 72.8% 100%)',
    'Channel Mix — revenue donut gradient'
)

rep(
    '<div><span style="color:var(--ch-sem)">■</span> SEM <strong>54.3%</strong></div>\n              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>17.5%</strong></div>\n              <div><span style="color:var(--ch-social)">■</span> Social <strong>28.2%</strong></div>',
    '<div><span style="color:var(--ch-sem)">■</span> SEM <strong>55.9%</strong></div>\n              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>16.9%</strong></div>\n              <div><span style="color:var(--ch-social)">■</span> Social <strong>27.2%</strong></div>',
    'Channel Mix — revenue donut legend'
)

rep(
    '<div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">$366K total attributed</div>',
    '<div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">$379K total attributed</div>',
    'Channel Mix — revenue donut footer'
)

rep(
    '<div class="ch-title">Meta 36.8× · SEM 26.3× · Social 18.9×</div>',
    '<div class="ch-title">Meta 36.8× · SEM 28.1× · Social 18.9×</div>',
    'Channel Mix — ROAS donut title'
)

rep(
    'background:conic-gradient(var(--ch-meta) 0% 44.9%,var(--ch-sem) 44.9% 77.0%,var(--ch-social) 77.0% 100%)',
    'background:conic-gradient(var(--ch-meta) 0% 43.9%,var(--ch-sem) 43.9% 77.4%,var(--ch-social) 77.4% 100%)',
    'Channel Mix — ROAS donut gradient'
)

rep(
    '<div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>36.8×</strong></div>\n              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>26.3×</strong></div>\n              <div><span style="color:var(--ch-social)">■</span> Social <strong>18.9×</strong></div>',
    '<div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>36.8×</strong></div>\n              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>28.1×</strong></div>\n              <div><span style="color:var(--ch-social)">■</span> Social <strong>18.9×</strong></div>',
    'Channel Mix — ROAS donut legend'
)

rep(
    '<strong>Most efficient:</strong> Metasearch 36.8× ROAS · 2.71% CoS — best per-dollar return. <strong>SEM</strong> $199K (54%) · <strong>Social</strong> $103K (28%) — Meta full-attribution 18.9× ROAS · 5.3% CoS is strong performance. Social bookings 205 confirmed from Windsor.ai.',
    '<strong>Most efficient:</strong> Metasearch 36.8× ROAS · 2.71% CoS — best per-dollar return. <strong>SEM</strong> $212K (56%) · <strong>Social</strong> $103K (27%) — $379K total revenue · 25.7× blended ROAS. Social bookings 205 confirmed from Windsor.ai.',
    'Channel Mix — action card'
)

print('\n═══ 3. ALL CHANNELS YTD (slide 07) — April revenue data point ═══')

# Revenue polyline — change Apr endpoint from y=180 to y=136
rep(
    '<polyline points="60,137 130,155 200,134 270,180" fill="none" stroke="#5DC8C5" stroke-width="3"/>',
    '<polyline points="60,137 130,155 200,134 270,136" fill="none" stroke="#5DC8C5" stroke-width="3"/>',
    'All Channels YTD — revenue polyline Apr endpoint'
)

# April revenue circle
rep(
    '<circle cx="270" cy="180" r="4" fill="#5DC8C5" stroke="#FFFFFF" stroke-width="2"/>',
    '<circle cx="270" cy="136" r="4" fill="#5DC8C5" stroke="#FFFFFF" stroke-width="2"/>',
    'All Channels YTD — revenue circle Apr'
)

# April revenue label — move above circle and update text
rep(
    '<text x="270" y="195">$258K</text>',
    '<text x="270" y="125">$379K</text>',
    'All Channels YTD — revenue label Apr'
)

# YTD footer stats
rep(
    '$59.5K cost · $1.33M revenue · <span class="pos" style="font-weight:600">22.3× ROAS</span> · annualised: $4.0M rev',
    '$59.5K cost · $1.34M revenue · <span class="pos" style="font-weight:600">22.6× ROAS</span> · annualised: $4.0M rev',
    'All Channels YTD — footer stats'
)

print('\n═══ 4. SEM SECTION DIVIDER (slide 08) ═══')

rep(
    '$7,151 spend · $166,996 revenue · 23.4× ROAS · 4 hotels + Group cross-portfolio.',
    '$7,542 spend · $211,757 revenue · 28.1× ROAS · 4 hotels + Group cross-portfolio.',
    'SEM Section Divider subtitle'
)

print('\n═══ 5. SEM PER HOTEL (slide 10) ═══')

rep(
    '<tr><td>Brady Apt Hardware Lane</td><td>$1,499</td><td>$43,351</td><td class="pos">28.9×</td><td class="pos">3.5%</td><td>74.3</td><td>1,648</td><td>$0.91</td></tr>',
    '<tr><td>Brady Apt Hardware Lane</td><td>$1,499</td><td>$45,515</td><td class="pos">30.4×</td><td class="pos">3.3%</td><td>77.3</td><td>1,648</td><td>$0.91</td></tr>',
    'SEM Per Hotel — Hardware Lane'
)

rep(
    '<tr><td>Brady Apt Flinders Street</td><td>$1,072</td><td>$30,544</td><td class="pos">28.5×</td><td class="pos">3.5%</td><td>57.3</td><td>1,896</td><td>$0.57</td></tr>',
    '<tr><td>Brady Apt Flinders Street</td><td>$1,072</td><td>$34,580</td><td class="pos">32.3×</td><td class="pos">3.1%</td><td>62.3</td><td>1,896</td><td>$0.57</td></tr>',
    'SEM Per Hotel — Flinders Street'
)

rep(
    '<tr><td>Brady Hotels Central Melbourne</td><td>$1,592</td><td>$44,227</td><td class="pos">27.8×</td><td class="pos">3.6%</td><td>87.2</td><td>2,107</td><td>$0.76</td></tr>',
    '<tr><td>Brady Hotels Central Melbourne</td><td>$1,592</td><td>$49,551</td><td class="pos">31.1×</td><td class="pos">3.2%</td><td>98.3</td><td>2,107</td><td>$0.76</td></tr>',
    'SEM Per Hotel — Central Melbourne'
)

rep(
    '<tr><td>Brady Hotels Jones Lane</td><td>$1,229</td><td>$33,412</td><td>27.2×</td><td class="pos">3.7%</td><td>90.6</td><td>1,302</td><td>$0.94</td></tr>',
    '<tr><td>Brady Hotels Jones Lane</td><td>$1,229</td><td>$33,591</td><td class="pos">27.3×</td><td class="pos">3.7%</td><td>91.6</td><td>1,302</td><td>$0.94</td></tr>',
    'SEM Per Hotel — Jones Lane'
)

rep(
    '<tr><td>Brady Group (cross-portfolio)</td><td>$2,150</td><td>$47,149</td><td>21.9×</td><td class="pos">4.6%</td><td>92.1</td><td>4,768</td><td>$0.45</td></tr>',
    '<tr><td>Brady Group (cross-portfolio)</td><td>$2,150</td><td>$48,520</td><td class="pos">22.6×</td><td class="pos">4.4%</td><td>94.4</td><td>4,768</td><td>$0.45</td></tr>',
    'SEM Per Hotel — Group'
)

rep(
    '<tfoot><tr><td>Total</td><td>$7,542</td><td>$198,683</td><td class="pos">26.3×</td><td class="pos">3.8%</td><td>401.5</td><td>11,721</td><td>$0.64</td></tr></tfoot>',
    '<tfoot><tr><td>Total</td><td>$7,542</td><td>$211,757</td><td class="pos">28.1×</td><td class="pos">3.6%</td><td>423.8</td><td>11,721</td><td>$0.64</td></tr></tfoot>',
    'SEM Per Hotel — total row'
)

rep(
    '<strong>All hotels 27–29× ROAS</strong> — Hardware Lane 28.9× + Flinders 28.5× + Central 27.8× + Jones 27.2× all at scale. <strong>Brady Group 21.9×</strong> — Display Retargeting ($291 combined spend, near-zero conversions) flagged for pause; rest is solid brand + PMAX.',
    '<strong>All hotels 27–32× ROAS</strong> — Flinders Street 32.3× + Central 31.1× + Hardware Lane 30.4× + Jones 27.3× all at scale. <strong>Brady Group 22.6×</strong> — Display Retargeting ($291 combined spend, near-zero conversions) flagged for pause; rest is solid brand + PMAX.',
    'SEM Per Hotel — action card'
)

print('\n═══ 6. SEM YTD (slide 13) — April revenue data point ═══')

# Revenue polyline (SEM YTD chart)
rep(
    '<polyline points="60,162 130,180 200,165 270,196" fill="none" stroke="#5DC8C5" stroke-width="3"/>',
    '<polyline points="60,162 130,180 200,165 270,190" fill="none" stroke="#5DC8C5" stroke-width="3"/>',
    'SEM YTD — revenue polyline Apr endpoint'
)

# April revenue circle (SEM YTD)
rep(
    '<circle cx="270" cy="196" r="4" fill="#5DC8C5" stroke="#FFFFFF" stroke-width="2"/>',
    '<circle cx="270" cy="190" r="4" fill="#5DC8C5" stroke="#FFFFFF" stroke-width="2"/>',
    'SEM YTD — revenue circle Apr'
)

# April revenue label (SEM YTD)
rep(
    '<text x="270" y="211">$194K</text>',
    '<text x="270" y="180">$212K</text>',
    'SEM YTD — revenue label Apr'
)

# YTD footer
rep(
    '<strong style="color:var(--ch-sem)">YTD 2026 (Jan–Apr):</strong> $33,424 cost · $1.03M revenue · <span class="pos" style="font-weight:600">30.8× ROAS · 3.2% CoS</span>',
    '<strong style="color:var(--ch-sem)">YTD 2026 (Jan–Apr):</strong> $33.5K cost · $1.05M revenue · <span class="pos" style="font-weight:600">31.3× ROAS · 3.2% CoS</span>',
    'SEM YTD — footer stats'
)

print('\n═══ 7. SOCIAL SECTION DIVIDER ═══')

rep(
    '$5,089 spend · 372K impressions · 5,924 clicks · 4 hotels + Group cross-portfolio.',
    '$5,452 spend · 402K impressions · 6,382 clicks · 4 hotels + Group cross-portfolio.',
    'Social Section Divider subtitle'
)

# ── Write output ──────────────────────────────────────────────────────────────
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\n✓ {changes} changes applied. File saved.')
print('Done.')
