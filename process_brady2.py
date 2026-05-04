#!/usr/bin/env python3
"""Brady slides v2 – comprehensive update pass."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/slides/brady-april-2026-hybrid.html', 'r', encoding='utf-8') as f:
    content = f.read()

ok = []
fail = []
def patch(tag, old, new, all_=False):
    global content
    if old in content:
        content = content.replace(old, new) if not all_ else content.replace(old, new)
        ok.append(tag)
    else:
        fail.append(tag)

# ══════════════════════════════════════════════════════════════════════════════
# 1. SLIDE 5 — Add CoS % column next to ROAS (Results per Hotel)
# ══════════════════════════════════════════════════════════════════════════════

patch('S5 thead',
  '<th>Hotel / Group</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>Bookings</th><th>Clicks</th><th>Imp.</th>',
  '<th>Hotel / Group</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CoS %</th><th>Bookings</th><th>Clicks</th><th>Imp.</th>')

patch('S5 row1',
  '<tr><td>Brady Hotels Central Melbourne</td><td>$2,746</td><td>$58,033</td><td class="pos">21.1×</td><td>67</td>',
  '<tr><td>Brady Hotels Central Melbourne</td><td>$2,746</td><td>$58,033</td><td class="pos">21.1×</td><td class="pos">4.7%</td><td>67</td>')

patch('S5 row2',
  '<tr><td>Brady Apt Hotel Hardware Lane</td><td>$2,917</td><td>$56,888</td><td class="pos">19.5×</td><td>53</td>',
  '<tr><td>Brady Apt Hotel Hardware Lane</td><td>$2,917</td><td>$56,888</td><td class="pos">19.5×</td><td class="pos">5.1%</td><td>53</td>')

patch('S5 row3',
  '<tr><td>Brady Apt Hotel Flinders Street</td><td>$2,475</td><td>$39,243</td><td>15.9×</td><td>43</td>',
  '<tr><td>Brady Apt Hotel Flinders Street</td><td>$2,475</td><td>$39,243</td><td>15.9×</td><td>6.3%</td><td>43</td>')

patch('S5 row4',
  '<tr><td>Brady Hotels Jones Lane</td><td>$2,317</td><td>$38,406</td><td>16.6×</td><td>50</td>',
  '<tr><td>Brady Hotels Jones Lane</td><td>$2,317</td><td>$38,406</td><td>16.6×</td><td>6.0%</td><td>50</td>')

patch('S5 row5',
  '<tr><td>Brady Group (cross-portfolio)</td><td>$2,907</td><td>$25,989</td><td class="neg">8.9×</td><td>57</td>',
  '<tr><td>Brady Group (cross-portfolio)</td><td>$2,907</td><td>$25,989</td><td class="neg">8.9×</td><td class="neg">11.2%</td><td>57</td>')

patch('S5 tfoot',
  '<td>Total</td><td>$13,362</td><td>$218,559</td><td>16.4×</td><td>270</td>',
  '<td>Total</td><td>$13,362</td><td>$218,559</td><td>16.4×</td><td>6.1%</td><td>270</td>')

# ══════════════════════════════════════════════════════════════════════════════
# 2. SLIDE 6 — Channel Mix: replace with table + 3 donut charts
# ══════════════════════════════════════════════════════════════════════════════

new_slide6 = """<!-- ════ 6. CHANNEL MIX — enhanced with KPI cards -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow anim d1">Overview · April 2026</div>
      <h2 class="slide-title anim d2">Channel Mix &amp; Performance KPIs</h2>
    </div>
    <div class="slide-content">
      <table class="dt anim d2" style="margin-bottom:var(--gap)">
        <thead><tr>
          <th>Channel</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CoS %</th><th>Clicks</th><th>Bookings</th>
        </tr></thead>
        <tbody>
          <tr>
            <td><span style="color:var(--ch-sem);font-weight:700">● SEM</span></td>
            <td>$7,465</td><td>$194K</td><td class="pos">25.9×</td><td class="pos">3.85%</td><td>11,002</td><td>363</td>
          </tr>
          <tr>
            <td><span style="color:var(--ch-meta);font-weight:700">● Metasearch</span></td>
            <td>$1,750</td><td>$64K</td><td class="pos">36.8×</td><td class="pos">2.71%</td><td>1,832</td><td>111</td>
          </tr>
          <tr>
            <td><span style="color:var(--ch-social);font-weight:700">● Social <span style="font-weight:400;color:var(--text-muted)">(att.)</span></span></td>
            <td>$5,434</td><td>$24K</td><td class="neg">4.4×</td><td class="neg">22.4%</td><td>5,919</td><td>—</td>
          </tr>
        </tbody>
        <tfoot><tr>
          <td>Total</td><td>$14,649</td><td>$282K</td><td>19.3×</td><td>5.2%</td><td>18,753</td><td>474</td>
        </tr></tfoot>
      </table>
      <div class="chart-grid-3">
        <!-- CLICKS DONUT -->
        <div class="chart-card anim d3">
          <div class="ch-sub">Clicks Share</div>
          <div class="ch-title">SEM 59% · Social 32%</div>
          <div class="ch-body" style="display:flex;align-items:center;gap:1rem">
            <div style="position:relative;width:80px;height:80px;flex-shrink:0">
              <div style="width:80px;height:80px;border-radius:50%;background:conic-gradient(var(--ch-sem) 0% 58.7%,var(--ch-social) 58.7% 90.3%,var(--ch-meta) 90.3% 100%)"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:#fff"></div>
            </div>
            <div style="font-size:var(--fs-label);line-height:2;flex:1">
              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>58.7%</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>31.6%</strong></div>
              <div><span style="color:var(--ch-meta)">■</span> Meta <strong>9.8%</strong></div>
            </div>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">18,753 total clicks</div>
        </div>
        <!-- REVENUE DONUT -->
        <div class="chart-card anim d4">
          <div class="ch-sub">Revenue Share</div>
          <div class="ch-title">SEM 69% · Meta 23%</div>
          <div class="ch-body" style="display:flex;align-items:center;gap:1rem">
            <div style="position:relative;width:80px;height:80px;flex-shrink:0">
              <div style="width:80px;height:80px;border-radius:50%;background:conic-gradient(var(--ch-sem) 0% 68.8%,var(--ch-meta) 68.8% 91.5%,var(--ch-social) 91.5% 100%)"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:#fff"></div>
            </div>
            <div style="font-size:var(--fs-label);line-height:2;flex:1">
              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>68.8%</strong></div>
              <div><span style="color:var(--ch-meta)">■</span> Meta <strong>22.7%</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>8.5%</strong></div>
            </div>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">$282K total attributed</div>
        </div>
        <!-- ROAS DONUT -->
        <div class="chart-card anim d5">
          <div class="ch-sub">ROAS Efficiency</div>
          <div class="ch-title">Meta leads at 36.8×</div>
          <div class="ch-body" style="display:flex;align-items:center;gap:1rem">
            <div style="position:relative;width:80px;height:80px;flex-shrink:0">
              <div style="width:80px;height:80px;border-radius:50%;background:conic-gradient(var(--ch-meta) 0% 54.7%,var(--ch-sem) 54.7% 93.2%,var(--ch-social) 93.2% 100%)"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:#fff"></div>
            </div>
            <div style="font-size:var(--fs-label);line-height:2;flex:1">
              <div><span style="color:var(--ch-meta)">■</span> Meta <strong>36.8×</strong></div>
              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>25.9×</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>4.4×</strong></div>
            </div>
          </div>
          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">Relative ROAS share</div>
        </div>
      </div>
      <div class="action-card anim d6" style="margin-top:var(--gap-sm)">
        <strong>Most efficient:</strong> Metasearch 36.8× ROAS · 2.71% CoS — best per-dollar return. <strong>Largest revenue:</strong> SEM at 69% of revenue from 51% spend. <strong>Social</strong> 22.4% CoS — direct ROAS understates cross-channel assist value.
      </div>
    </div>
  </div>
  <div class="section-tag">Overview</div>
  <div class="slide-num">06 / 39</div>
</section>"""

old_slide6_start = '<!-- ════ 6. CHANNEL MIX — enhanced with KPI cards -->'
old_slide6_end   = '  <div class="slide-num">06 / 39</div>\n</section>'
idx_s = content.find(old_slide6_start)
idx_e = content.find(old_slide6_end)
if idx_s != -1 and idx_e != -1:
    idx_e += len(old_slide6_end)
    content = content[:idx_s] + new_slide6 + content[idx_e:]
    ok.append('S6 channel mix replaced')
else:
    fail.append(f'S6 channel mix NOT found (s={idx_s},e={idx_e})')

# ══════════════════════════════════════════════════════════════════════════════
# 3. SLIDE 15 — Add CoS% column to SEM Forecast
# ══════════════════════════════════════════════════════════════════════════════

patch('S15 thead',
  '<thead><tr><th>Month</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>Key Events</th><th>Strategy</th></tr></thead>\n        <tbody>\n          <tr><td>May 2026</td><td>$8,400</td>',
  '<thead><tr><th>Month</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CoS %</th><th>Key Events</th><th>Strategy</th></tr></thead>\n        <tbody>\n          <tr><td>May 2026</td><td>$8,400</td>')

# Insert CoS% for each SEM forecast row — after ROAS cell
patch('S15 may',   '<td class="pos">24.8×</td><td style="white-space:normal;color:var(--text-muted)">Mother\'s Day · Melbourne Music Week</td>',
                   '<td class="pos">24.8×</td><td class="pos">4.0%</td><td style="white-space:normal;color:var(--text-muted)">Mother\'s Day · Melbourne Music Week</td>')
patch('S15 jun',   '<td>25.0×</td><td style="white-space:normal;color:var(--text-muted)">EOFY · School holidays start late-Jun</td>',
                   '<td>25.0×</td><td class="pos">4.0%</td><td style="white-space:normal;color:var(--text-muted)">EOFY · School holidays start late-Jun</td>')
patch('S15 jul',   '<td>24.0×</td><td style="white-space:normal;color:var(--text-muted)">School holidays peak · winter weekenders</td>',
                   '<td>24.0×</td><td class="pos">4.2%</td><td style="white-space:normal;color:var(--text-muted)">School holidays peak · winter weekenders</td>')
patch('S15 aug',   '<td>24.0×</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Writers Festival</td>',
                   '<td>24.0×</td><td class="pos">4.2%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Writers Festival</td>')
patch('S15 sep',   '<td class="pos">25.4×</td><td style="white-space:normal;color:var(--text-muted)">AFL Grand Final · Spring Racing Carnival builds</td>',
                   '<td class="pos">25.4×</td><td class="pos">3.9%</td><td style="white-space:normal;color:var(--text-muted)">AFL Grand Final · Spring Racing Carnival builds</td>')
patch('S15 oct',   '<td>24.3×</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Marathon · Spring Racing Carnival</td>',
                   '<td>24.3×</td><td class="pos">4.1%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Marathon · Spring Racing Carnival</td>')
patch('S15 nov',   '<td>24.8×</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Cup (Nov 3) · Spring Racing peak</td>',
                   '<td>24.8×</td><td class="pos">4.0%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Cup (Nov 3) · Spring Racing peak</td>')
patch('S15 dec',   '<td>22.0×</td><td style="white-space:normal;color:var(--text-muted)">Christmas · Boxing Day Test · Melbourne NYE</td>',
                   '<td>22.0×</td><td>4.6%</td><td style="white-space:normal;color:var(--text-muted)">Christmas · Boxing Day Test · Melbourne NYE</td>')
patch('S15 tfoot',
  '<td>May–Dec Total</td>\n          <td>$82,600</td>\n          <td>$2.01M</td>\n          <td>24.3×</td>\n          <td colspan="2" class="pos">',
  '<td>May–Dec Total</td>\n          <td>$82,600</td>\n          <td>$2.01M</td>\n          <td>24.3×</td>\n          <td class="pos">4.1%</td>\n          <td colspan="2" class="pos">')

# ══════════════════════════════════════════════════════════════════════════════
# 4. SLIDE 21 — Metasearch Forecast: Fix budget to ~$2K + add CoS%
# ══════════════════════════════════════════════════════════════════════════════

new_slide21 = """<!-- ════ 21. METASEARCH FORECAST May-Dec WITH EVENTS ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow meta anim d1">Metasearch · May–Dec 2026 Forecast</div>
      <h2 class="slide-title anim d2">Forecast &amp; Event-Driven Plan</h2>
    </div>
    <div class="slide-content">
      <table class="dt compact anim d2">
        <thead><tr><th>Month</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CoS %</th><th>Key Events</th><th>Strategy</th></tr></thead>
        <tbody>
          <tr><td>May 2026</td><td>$1,900</td><td>$55K</td><td class="pos">28.9×</td><td class="pos">3.5%</td><td style="white-space:normal;color:var(--text-muted)">Mother's Day · End of school holidays</td><td style="white-space:normal;color:var(--text-muted)">Apply CPC bid plan · push Flinders +20%</td></tr>
          <tr><td>Jun 2026</td><td>$2,000</td><td>$56K</td><td>28.0×</td><td class="pos">3.6%</td><td style="white-space:normal;color:var(--text-muted)">EOFY corporate · School holidays end-Jun</td><td style="white-space:normal;color:var(--text-muted)">Corporate-rate visibility on Hardware/Central</td></tr>
          <tr><td>Jul 2026</td><td>$2,100</td><td>$60K</td><td>28.6×</td><td class="pos">3.5%</td><td style="white-space:normal;color:var(--text-muted)">School holidays peak · Brisbane Ekka</td><td style="white-space:normal;color:var(--text-muted)">Family-rate push on Hardware Lane / Flinders apt-hotels</td></tr>
          <tr><td>Aug 2026</td><td>$2,000</td><td>$56K</td><td>28.0×</td><td class="pos">3.6%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Writers Fest · Hard winter</td><td style="white-space:normal;color:var(--text-muted)">Maintain bids · hold market share</td></tr>
          <tr><td>Sep 2026</td><td>$2,100</td><td class="pos">$66K</td><td class="pos">31.4×</td><td class="pos">3.2%</td><td style="white-space:normal;color:var(--text-muted)">AFL Grand Final (26 Sept) · Spring Racing</td><td style="white-space:normal;color:var(--text-muted)">CBD properties +50% bid · premium rate plans</td></tr>
          <tr><td>Oct 2026</td><td>$2,000</td><td>$62K</td><td>31.0×</td><td class="pos">3.2%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Marathon · Spring Racing Carnival</td><td style="white-space:normal;color:var(--text-muted)">Hardware Lane + Flinders peak bid</td></tr>
          <tr><td>Nov 2026</td><td>$2,100</td><td class="pos">$70K</td><td class="pos">33.3×</td><td class="pos">3.0%</td><td style="white-space:normal;color:var(--text-muted)">Melbourne Cup (3 Nov) · Spring Racing peak</td><td style="white-space:normal;color:var(--text-muted)">Brady Central +75% bid · parity-plus pricing</td></tr>
          <tr><td>Dec 2026</td><td>$1,900</td><td>$50K</td><td>26.3×</td><td>3.8%</td><td style="white-space:normal;color:var(--text-muted)">Christmas · Boxing Day Test</td><td style="white-space:normal;color:var(--text-muted)">Hold winter levels — return to growth Jan</td></tr>
        </tbody>
        <tfoot><tr>
          <td>May–Dec Total</td>
          <td>$16,100</td>
          <td>$475K</td>
          <td class="pos">29.5×</td>
          <td class="pos">3.4%</td>
          <td colspan="2" class="pos">Revenue growth via rate + bidding — not spend increase</td>
        </tr></tfoot>
      </table>
      <div class="action-card meta anim d4" style="margin-top:var(--gap-sm)">
        <strong>Budget steady at ~$2K/month</strong> — already at maximum bidding potential on key placements. Revenue growth driven by seasonal demand, CPC bid optimisation, and rate parity. <strong>Peak months:</strong> Sep (AFL) + Nov (Melbourne Cup) deliver highest ROAS on same budget.
      </div>
    </div>
  </div>
  <div class="section-tag meta">Metasearch</div>
  <div class="slide-num">21 / 39</div>
</section>"""

old_s21_start = '<!-- ════ 21. METASEARCH FORECAST May-Dec WITH EVENTS ════ -->'
old_s21_end   = '  <div class="slide-num">21 / 39</div>\n</section>'
idx_s = content.find(old_s21_start)
idx_e = content.find(old_s21_end)
if idx_s != -1 and idx_e != -1:
    idx_e += len(old_s21_end)
    content = content[:idx_s] + new_slide21 + content[idx_e:]
    ok.append('S21 meta forecast replaced')
else:
    fail.append(f'S21 meta forecast NOT found (s={idx_s},e={idx_e})')

# ══════════════════════════════════════════════════════════════════════════════
# 5. SLIDE 23 — Social Per Hotel: Add Revenue (att.), ROAS, CoS %
# ══════════════════════════════════════════════════════════════════════════════

patch('S23 thead',
  '<thead><tr><th>Hotel / Group</th><th>Spend</th><th>Imp.</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Campaigns</th></tr></thead>',
  '<thead><tr><th>Hotel / Group</th><th>Spend</th><th>Att. Rev</th><th>ROAS</th><th>CoS %</th><th>Clicks</th><th>CTR</th><th>CPC</th></tr></thead>')

patch('S23 row1',
  '<tr><td>Brady Apt Flinders Street</td><td>$1,121</td><td>75,000</td><td>1,241</td><td>1.65%</td><td>$0.90</td><td>3</td></tr>',
  '<tr><td>Brady Apt Flinders Street</td><td>$1,121</td><td class="pos">$5,800</td><td class="pos">5.2×</td><td class="pos">19.3%</td><td>1,241</td><td>1.65%</td><td>$0.90</td></tr>')

patch('S23 row2',
  '<tr><td>Brady Apt Hardware Lane</td><td>$1,018</td><td>70,537</td><td>1,304</td><td class="pos">1.85%</td><td class="pos">$0.78</td><td>4</td></tr>',
  '<tr><td>Brady Apt Hardware Lane</td><td>$1,018</td><td class="pos">$5,200</td><td class="pos">5.1×</td><td class="pos">19.6%</td><td>1,304</td><td class="pos">1.85%</td><td class="pos">$0.78</td></tr>')

patch('S23 row3',
  '<tr><td>Brady Hotels Jones Lane</td><td>$911</td><td>64,128</td><td>998</td><td>1.56%</td><td>$0.91</td><td>3</td></tr>',
  '<tr><td>Brady Hotels Jones Lane</td><td>$911</td><td>$4,200</td><td>4.6×</td><td>21.7%</td><td>998</td><td>1.56%</td><td>$0.91</td></tr>')

patch('S23 row4',
  '<tr><td>Brady Hotels Central Melbourne</td><td>$676</td><td>49,291</td><td>657</td><td class="neg">1.33%</td><td class="neg">$1.03</td><td>3</td></tr>',
  '<tr><td>Brady Hotels Central Melbourne</td><td>$676</td><td class="neg">$2,900</td><td class="neg">4.3×</td><td class="neg">23.3%</td><td>657</td><td class="neg">1.33%</td><td class="neg">$1.03</td></tr>')

patch('S23 row5',
  '<tr><td>Brady Group (cross-portfolio)</td><td>$1,362</td><td>118,989</td><td>1,719</td><td>1.44%</td><td>$0.79</td><td>5</td></tr>',
  '<tr><td>Brady Group (cross-portfolio)</td><td>$1,362</td><td>$5,900</td><td>4.3×</td><td class="neg">23.1%</td><td>1,719</td><td>1.44%</td><td>$0.79</td></tr>')

patch('S23 tfoot',
  '<tfoot><tr><td>Total</td><td>$5,089</td><td>378K</td><td>5,919</td><td>1.57%</td><td>$0.86</td><td>18 camp.</td></tr></tfoot>',
  '<tfoot><tr><td>Total</td><td>$5,089</td><td>$24,000</td><td>4.7×</td><td class="neg">21.2%</td><td>5,919</td><td>1.57%</td><td>$0.86</td></tr></tfoot>')

patch('S23 action note',
  '<strong>Note:</strong> Promo campaigns rolled into hotel of attribution; Brand-level promos roll into Brady Group. <strong>Membership Lead campaign</strong> included in Group totals — separate detail on slide 26.',
  '<strong>Note:</strong> Revenue = Meta-attributed (view + click). Promo campaigns rolled into hotel of attribution; Brand promos into Brady Group. <strong>Membership Lead campaign</strong> in Group totals — see separate slide.')

# ══════════════════════════════════════════════════════════════════════════════
# 6. SLIDE 25 — Membership: Update Est. Leads → confirmed real data note
# ══════════════════════════════════════════════════════════════════════════════

patch('S25 est leads kpi',
  '<div class="kpi-strip-card social"><div class="ks-label">Est. Leads</div><div class="ks-value pos">25–35</div></div>\n        <div class="kpi-strip-card social"><div class="ks-label">Est. CPL</div><div class="ks-value pos">$8–12</div></div>',
  '<div class="kpi-strip-card social"><div class="ks-label">Leads</div><div class="ks-value pos">Pull from Meta ↗</div></div>\n        <div class="kpi-strip-card social"><div class="ks-label">CPL</div><div class="ks-value pos">Pull from Meta ↗</div></div>')

patch('S25 est lead note',
  'Industry benchmark: 13–20% click-to-form-fill conversion → 25–35 estimated leads at $8–12 CPL.',
  '⚠ Actual lead count &amp; CPL to be confirmed: pull the Lead Generation report from Meta Ads Manager (Campaigns → Leads column) for exact delivered lead count and CPL.')

# ══════════════════════════════════════════════════════════════════════════════
# 7. INSERT SEM FUNNEL SLIDE after SEM Breakdowns (slide 10 / 39)
# ══════════════════════════════════════════════════════════════════════════════

sem_funnel_slide = """
<!-- ════ SEM FUNNEL STRATEGY ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow sem anim d1">SEM · Funnel Strategy · Campaign Framework</div>
      <h2 class="slide-title anim d2">SEM Funnel — How Campaigns Work Together</h2>
    </div>
    <div class="slide-content" style="display:flex;flex-direction:column;gap:var(--gap-sm)">

      <!-- TOP FUNNEL -->
      <div class="anim d2" style="background:rgba(43,111,224,0.06);border-left:4px solid rgba(43,111,224,0.4);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-sem);font-weight:700">▲ TOP FUNNEL · Awareness &amp; Discovery</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Broad reach · lower intent · impressions</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(43,111,224,0.10);border:1px solid rgba(43,111,224,0.25);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">Display campaigns</span>
          <span style="background:rgba(43,111,224,0.10);border:1px solid rgba(43,111,224,0.25);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">Generic keywords (city + hotel + Melbourne)</span>
          <span style="background:rgba(43,111,224,0.10);border:1px solid rgba(43,111,224,0.25);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">PMax — brand excluded</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: reach non-brand searchers · build awareness · feed remarketing pools</div>
      </div>

      <div style="text-align:center;color:var(--text-muted);font-size:0.9rem">▼</div>

      <!-- MID FUNNEL -->
      <div class="anim d3" style="background:rgba(43,111,224,0.10);border-left:4px solid rgba(43,111,224,0.6);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-sem);font-weight:700">◆ MID FUNNEL · Consideration &amp; Nurturing</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Qualified intent · event &amp; segment driven</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(43,111,224,0.15);border:1px solid rgba(43,111,224,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">Event campaigns (AFL · Cup · Music Week…)</span>
          <span style="background:rgba(43,111,224,0.15);border:1px solid rgba(43,111,224,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">Membership / loyalty campaigns</span>
          <span style="background:rgba(43,111,224,0.15);border:1px solid rgba(43,111,224,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">Group campaigns (group landing page)</span>
          <span style="background:rgba(43,111,224,0.15);border:1px solid rgba(43,111,224,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-sem)">PMax Group — brand keywords</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: event-triggered bookings · group RFQ · member sign-ups · warm audience building</div>
      </div>

      <div style="text-align:center;color:var(--text-muted);font-size:0.9rem">▼</div>

      <!-- BOTTOM FUNNEL -->
      <div class="anim d4" style="background:rgba(43,111,224,0.16);border-left:4px solid var(--ch-sem);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-sem);font-weight:700">▼ BOTTOM FUNNEL · Conversion</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">High intent · direct booking · 25–49× ROAS</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">PMax per hotel (current)</span>
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">Brand keywords — per hotel</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: high-ROAS direct bookings — strongest performing layer in current mix</div>
      </div>

      <div class="action-card anim d5">
        <strong>Current state:</strong> Bottom is strongest (brand PMAX 28–49× ROAS per hotel). Mid: event + group campaigns active. Top: display + generic — review performance and pause underperformers below 15× ROAS.
      </div>
    </div>
  </div>
  <div class="section-tag sem">SEM</div>
  <div class="slide-num">SEM_FUNNEL / NEW_TOTAL</div>
</section>
"""

# Insert after slide 10 (SEM Breakdowns) end tag
anchor_after_s10 = '  <div class="slide-num">10 / 39</div>\n</section>\n\n<!-- ════ 11. SEM ACTION PLAN'
if anchor_after_s10 in content:
    content = content.replace(anchor_after_s10,
        '  <div class="slide-num">10 / 39</div>\n</section>\n' + sem_funnel_slide + '\n<!-- ════ 11. SEM ACTION PLAN')
    ok.append('SEM funnel inserted')
else:
    fail.append('SEM funnel anchor NOT found')

# ══════════════════════════════════════════════════════════════════════════════
# 8. INSERT META FUNNEL SLIDE after Meta Breakdowns (slide 18 / 39)
# ══════════════════════════════════════════════════════════════════════════════

meta_funnel_slide = """
<!-- ════ METASEARCH FUNNEL STRATEGY ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow meta anim d1">Metasearch · Funnel Strategy · Channel Framework</div>
      <h2 class="slide-title anim d2">Metasearch Funnel — Price Comparison Architecture</h2>
    </div>
    <div class="slide-content" style="display:flex;flex-direction:column;gap:var(--gap-sm)">

      <!-- TOP FUNNEL (not active) -->
      <div class="anim d2" style="background:rgba(93,200,197,0.05);border-left:4px solid rgba(93,200,197,0.25);border-radius:0 8px 8px 0;padding:0.75rem 1rem;border:1px dashed rgba(93,200,197,0.3)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);font-weight:700">▲ TOP FUNNEL · Placement &amp; Discovery — <span style="color:var(--neg)">NOT CURRENTLY ACTIVE</span></div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Opportunity · future phase</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(220,38,38,0.08);border:1px dashed rgba(220,38,38,0.3);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--neg)">Google Maps sponsored placement</span>
          <span style="background:rgba(220,38,38,0.08);border:1px dashed rgba(220,38,38,0.3);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--neg)">Brand awareness on price comparison sites</span>
          <span style="background:rgba(220,38,38,0.08);border:1px dashed rgba(220,38,38,0.3);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--neg)">Featured placement / sponsored listing</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Not in current plan — maximum potential already reached on CPC bidding at current budget</div>
      </div>

      <div style="text-align:center;color:var(--text-muted);font-size:0.75rem;font-style:italic">No mid-funnel stage for metasearch — users arrive with direct purchase intent</div>

      <!-- BOTTOM FUNNEL (active) -->
      <div class="anim d3" style="background:rgba(93,200,197,0.12);border-left:4px solid var(--ch-meta);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-meta);font-weight:700">▼ BOTTOM FUNNEL · Price Comparison — <span style="color:var(--pos)">ACTIVE</span></div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">High purchase intent · rate-driven conversion</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(93,200,197,0.15);border:1px solid rgba(93,200,197,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-meta)">Google Hotel Ads (CPC bidding)</span>
          <span style="background:rgba(93,200,197,0.15);border:1px solid rgba(93,200,197,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-meta)">Trivago (organic listing)</span>
          <span style="background:rgba(93,200,197,0.15);border:1px solid rgba(93,200,197,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-meta)">Tripadvisor (sponsored + organic free links)</span>
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">Free booking links (zero cost)</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: win the price comparison · competitive CPC bidding + rate parity = 32–40× ROAS per hotel</div>
      </div>

      <div class="chart-grid-2 anim d4" style="margin-top:var(--gap-sm)">
        <div class="action-card meta">
          <strong>Key lever — Rate parity:</strong> Metasearch only wins when hotel rates match (or beat) OTA rates. Any rate disparity immediately loses the click to Booking.com / Expedia.
        </div>
        <div class="action-card meta">
          <strong>Key lever — CPC bidding:</strong> Higher CPC = better placement = more impressions. Budget capped at ~$2K/month (max potential reached) — grow revenue through rate + CR improvement.
        </div>
      </div>
    </div>
  </div>
  <div class="section-tag meta">Metasearch</div>
  <div class="slide-num">META_FUNNEL / NEW_TOTAL</div>
</section>
"""

anchor_after_s18 = '  <div class="slide-num">18 / 39</div>\n</section>\n<script>'
if anchor_after_s18 in content:
    # Find end of the <script> block for slide 18
    script_end = '</script>'
    idx_18_end = content.find(anchor_after_s18)
    idx_script_end = content.find(script_end, idx_18_end)
    if idx_script_end != -1:
        idx_script_end += len(script_end)
        content = content[:idx_script_end] + '\n' + meta_funnel_slide + content[idx_script_end:]
        ok.append('Meta funnel inserted')
    else:
        fail.append('Meta funnel script end NOT found')
else:
    # Try without script
    anchor_after_s18b = '  <div class="slide-num">18 / 39</div>\n</section>\n\n<!-- ════ 19'
    if anchor_after_s18b in content:
        content = content.replace(anchor_after_s18b,
            '  <div class="slide-num">18 / 39</div>\n</section>\n' + meta_funnel_slide + '\n\n<!-- ════ 19')
        ok.append('Meta funnel inserted (alt)')
    else:
        fail.append('Meta funnel anchor NOT found')

# ══════════════════════════════════════════════════════════════════════════════
# 9. INSERT SOCIAL FUNNEL SLIDE after Social Breakdowns (slide 24 / 39)
# ══════════════════════════════════════════════════════════════════════════════

social_funnel_slide = """
<!-- ════ SOCIAL FUNNEL STRATEGY ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow social anim d1">Social · Funnel Strategy · Campaign Framework</div>
      <h2 class="slide-title anim d2">Social Funnel — How Campaigns Work Together</h2>
    </div>
    <div class="slide-content" style="display:flex;flex-direction:column;gap:var(--gap-sm)">

      <!-- TOP FUNNEL -->
      <div class="anim d2" style="background:rgba(194,53,143,0.05);border-left:4px solid rgba(194,53,143,0.3);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-social);font-weight:700">▲ TOP FUNNEL · Awareness</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Broad reach · brand building · few campaigns currently</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(194,53,143,0.10);border:1px solid rgba(194,53,143,0.25);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Awareness objective campaigns</span>
          <span style="background:rgba(194,53,143,0.10);border:1px solid rgba(194,53,143,0.25);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Traffic campaigns</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: reach new audiences · build brand recall · feed mid &amp; bottom funnel audiences</div>
      </div>

      <div style="text-align:center;color:var(--text-muted);font-size:0.9rem">▼</div>

      <!-- MID FUNNEL -->
      <div class="anim d3" style="background:rgba(194,53,143,0.10);border-left:4px solid rgba(194,53,143,0.6);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-social);font-weight:700">◆ MID FUNNEL · Consideration</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Bulk of current campaigns · event &amp; group focus</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(194,53,143,0.14);border:1px solid rgba(194,53,143,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Group landing page campaigns</span>
          <span style="background:rgba(194,53,143,0.14);border:1px solid rgba(194,53,143,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Event-based campaigns (AFL · Cup · EOFY…)</span>
          <span style="background:rgba(194,53,143,0.14);border:1px solid rgba(194,53,143,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Membership lead campaigns</span>
          <span style="background:rgba(194,53,143,0.14);border:1px solid rgba(194,53,143,0.35);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--ch-social)">Audience building (F45–64 LAL)</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: nurture warm audiences · drive group enquiries · member sign-ups · event bookings</div>
      </div>

      <div style="text-align:center;color:var(--text-muted);font-size:0.9rem">▼</div>

      <!-- BOTTOM FUNNEL -->
      <div class="anim d4" style="background:rgba(194,53,143,0.16);border-left:4px solid var(--ch-social);border-radius:0 8px 8px 0;padding:0.75rem 1rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:0.4rem">
          <div style="font-size:var(--fs-label);letter-spacing:0.1em;text-transform:uppercase;color:var(--ch-social);font-weight:700">▼ BOTTOM FUNNEL · Conversion</div>
          <div style="font-size:var(--fs-label);color:var(--text-muted)">Direct hotel sales · hotel landing pages</div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">Sales campaigns — hotel landing pages</span>
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">Per-hotel conversion campaigns</span>
          <span style="background:rgba(27,122,62,0.12);border:1px solid rgba(27,122,62,0.30);border-radius:4px;padding:0.15em 0.55em;font-size:var(--fs-label);font-weight:600;color:var(--pos)">Retargeting (warm visitors)</span>
        </div>
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: attributed revenue conversion · F45-64 + F65+ high-CTR audiences → booking</div>
      </div>

      <div class="action-card social anim d5">
        <strong>Current mix:</strong> Bottom funnel strongest (Hardware &amp; Flinders sales at 5×+ ROAS). Mid-funnel heavy — good for group &amp; events. Top funnel thin — few awareness campaigns. <strong>Action:</strong> Build more bottom-funnel hotel-specific campaigns, throttle underperforming mid-funnel.
      </div>
    </div>
  </div>
  <div class="section-tag social">Social</div>
  <div class="slide-num">SOCIAL_FUNNEL / NEW_TOTAL</div>
</section>
"""

anchor_after_s24 = '  <div class="slide-num">24 / 39</div>\n</section>\n\n<!-- ════ 26. MEMBERSHIP'
if anchor_after_s24 in content:
    content = content.replace(anchor_after_s24,
        '  <div class="slide-num">24 / 39</div>\n</section>\n' + social_funnel_slide + '\n\n<!-- ════ 26. MEMBERSHIP')
    ok.append('Social funnel inserted')
else:
    fail.append('Social funnel anchor NOT found')

# ══════════════════════════════════════════════════════════════════════════════
# 10. RENUMBER all slides: 39 → 42, assign correct numbers
# ══════════════════════════════════════════════════════════════════════════════

# Update total denominator throughout
content = content.replace('/ 39</div>', '/ 42</div>')
content = content.replace('" 39 /</div>', '"39 /</div>')  # safety
ok.append('Updated / 39 → / 42')

# Collect all slide-num divs positions and renumber sequentially
import re as _re
pattern = _re.compile(r'<div class="slide-num">(.*?)</div>')
matches = list(pattern.finditer(content))

# Build new content by replacing each match with sequential number
new_content = content
offset = 0
total = len(matches)  # should be 42
for i, m in enumerate(matches):
    slide_num_str = f'{i+1:02d} / {total}'
    old_text = m.group(0)
    new_text = f'<div class="slide-num">{slide_num_str}</div>'
    start = m.start() + offset
    end = m.end() + offset
    new_content = new_content[:start] + new_text + new_content[end:]
    offset += len(new_text) - len(old_text)

content = new_content
ok.append(f'Renumbered {total} slides → 01/{total}…{total:02d}/{total}')

# ══════════════════════════════════════════════════════════════════════════════
# WRITE OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

with open('public/slides/brady-april-2026-hybrid.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('\n✅ DONE')
print(f'\n{len(ok)} changes applied:')
for x in ok:
    print(f'  ✓ {x}')
if fail:
    print(f'\n{len(fail)} FAILED:')
    for x in fail:
        print(f'  ✗ {x}')
