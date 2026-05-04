#!/usr/bin/env python3
"""Brady slides v5 – Update April 2026 data from Windsor.ai (Social + SEM)."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/slides/brady-april-2026-hybrid.html', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ═══════════════════════════════════════════════════════════════════════════════
# 1. CHANNEL MIX SLIDE — Update SEM and Social rows + totals + donuts
# ═══════════════════════════════════════════════════════════════════════════════

# SEM row
old = '            <td><span style="color:var(--ch-sem);font-weight:700">● SEM</span></td>\n            <td>$7,465</td><td>$194K</td><td class="pos">25.9×</td><td class="pos">3.85%</td><td>11,002</td><td>363</td>'
new = '            <td><span style="color:var(--ch-sem);font-weight:700">● SEM</span></td>\n            <td>$7,542</td><td>$199K</td><td class="pos">26.3×</td><td class="pos">3.8%</td><td>11,721</td><td>402</td>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — SEM row updated')
else: print('✗ Channel Mix — SEM row NOT found')

# Social row
old = '            <td><span style="color:var(--ch-social);font-weight:700">● Social <span style="font-weight:400;color:var(--text-muted)">(att.)</span></span></td>\n            <td>$5,434</td><td>$24K</td><td class="neg">4.4×</td><td class="neg">22.4%</td><td>5,919</td><td>—</td>'
new = '            <td><span style="color:var(--ch-social);font-weight:700">● Social <span style="font-weight:400;color:var(--text-muted)">(att.)</span></span></td>\n            <td>$5,452</td><td>$103K</td><td class="pos">18.9×</td><td class="pos">5.3%</td><td>6,382</td><td>205</td>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Social row updated')
else: print('✗ Channel Mix — Social row NOT found')

# Total row
old = '          <td>Total</td><td>$14,649</td><td>$282K</td><td>19.3×</td><td>5.2%</td><td>18,753</td><td>474</td>'
new = '          <td>Total</td><td>$14,744</td><td>$366K</td><td>24.8×</td><td>4.0%</td><td>19,935</td><td>718</td>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Total row updated')
else: print('✗ Channel Mix — Total row NOT found')

# Clicks donut: SEM 58.8% / Social 32.0% / Meta 9.2%
old = 'background:conic-gradient(var(--ch-sem) 0% 58.7%,var(--ch-social) 58.7% 90.3%,var(--ch-meta) 90.3% 100%)'
new = 'background:conic-gradient(var(--ch-sem) 0% 58.8%,var(--ch-social) 58.8% 90.8%,var(--ch-meta) 90.8% 100%)'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Clicks donut updated')
else: print('✗ Channel Mix — Clicks donut NOT found')

# Clicks donut title + legend
old = '          <div class="ch-title">SEM 59% · Social 32%</div>'
new = '          <div class="ch-title">SEM 59% · Social 32%</div>'  # same, keep
# legend total clicks
old = '          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">18,753 total clicks</div>'
new = '          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">19,935 total clicks</div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Clicks total label updated')
else: print('✗ Channel Mix — Clicks total label NOT found')

# Revenue donut: SEM 54.3% / Meta 17.5% / Social 28.2%
# Old gradient: SEM 0-68.8%, Meta 68.8-91.5%, Social 91.5-100%
old = 'background:conic-gradient(var(--ch-sem) 0% 68.8%,var(--ch-meta) 68.8% 91.5%,var(--ch-social) 91.5% 100%)'
new = 'background:conic-gradient(var(--ch-sem) 0% 54.3%,var(--ch-meta) 54.3% 71.8%,var(--ch-social) 71.8% 100%)'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Revenue donut updated')
else: print('✗ Channel Mix — Revenue donut NOT found')

# Revenue donut title
old = '          <div class="ch-title">SEM 69% · Meta 23%</div>'
new = '          <div class="ch-title">SEM 54% · Social 28%</div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Revenue donut title updated')
else: print('✗ Channel Mix — Revenue donut title NOT found')

# Revenue donut legend
old = '''              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>68.8%</strong></div>
              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>22.7%</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>8.5%</strong></div>'''
new = '''              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>54.3%</strong></div>
              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>17.5%</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>28.2%</strong></div>'''
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Revenue donut legend updated')
else: print('✗ Channel Mix — Revenue donut legend NOT found')

# Revenue donut total label
old = '          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">$282K total attributed</div>'
new = '          <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.5rem">$366K total attributed</div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — Revenue total label updated')
else: print('✗ Channel Mix — Revenue total label NOT found')

# ROAS donut: Meta 44.9% / SEM 32.1% / Social 23.1% (of combined 82.0)
# Old: Meta 54.7%, SEM 38.5% (93.2-54.7), Social 6.8% (100-93.2)
old = 'background:conic-gradient(var(--ch-meta) 0% 54.7%,var(--ch-sem) 54.7% 93.2%,var(--ch-social) 93.2% 100%)'
new = 'background:conic-gradient(var(--ch-meta) 0% 44.9%,var(--ch-sem) 44.9% 77.0%,var(--ch-social) 77.0% 100%)'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — ROAS donut updated')
else: print('✗ Channel Mix — ROAS donut NOT found')

# ROAS donut legend
old = '''              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>36.8×</strong></div>
              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>25.9×</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>4.4×</strong></div>'''
new = '''              <div><span style="color:var(--ch-meta)">■</span> Metasearch <strong>36.8×</strong></div>
              <div><span style="color:var(--ch-sem)">■</span> SEM <strong>26.3×</strong></div>
              <div><span style="color:var(--ch-social)">■</span> Social <strong>18.9×</strong></div>'''
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — ROAS donut legend updated')
else: print('✗ Channel Mix — ROAS donut legend NOT found')

# ROAS donut title
old = '          <div class="ch-title">Meta leads at 36.8×</div>'
new = '          <div class="ch-title">Meta 36.8× · SEM 26.3× · Social 18.9×</div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — ROAS donut title updated')
else: print('✗ Channel Mix — ROAS donut title NOT found')

# Channel Mix action card
old = '<strong>Most efficient:</strong> Metasearch 36.8× ROAS · 2.71% CoS — best per-dollar return. <strong>Largest revenue:</strong> SEM at 69% of revenue from 51% spend. <strong>Social</strong> 22.4% CoS — direct ROAS understates cross-channel assist value.'
new = '<strong>Most efficient:</strong> Metasearch 36.8× ROAS · 2.71% CoS — best per-dollar return. <strong>SEM</strong> $199K (54%) · <strong>Social</strong> $103K (28%) — Meta full-attribution 18.9× ROAS · 5.3% CoS is strong performance. Social bookings 205 confirmed from Windsor.ai.'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Channel Mix — action card updated')
else: print('✗ Channel Mix — action card NOT found')

# ═══════════════════════════════════════════════════════════════════════════════
# 2. SEM PER HOTEL SLIDE — Replace table body + total with Windsor data
# ═══════════════════════════════════════════════════════════════════════════════
old = '''        <tbody>
          <tr><td>Brady Hotels Central Melbourne</td><td>$1,489</td><td>$42,917</td><td class="pos">28.8×</td><td class="pos">3.5%</td><td>83.2</td><td>1,960</td><td>$0.76</td></tr>
          <tr><td>Brady Apt Hardware Lane</td><td>$1,422</td><td>$39,803</td><td class="pos">28.0×</td><td class="pos">3.6%</td><td>65.5</td><td>1,532</td><td>$0.93</td></tr>
          <tr><td>Brady Hotels Jones Lane</td><td>$1,164</td><td>$29,947</td><td>25.7×</td><td class="pos">3.9%</td><td>80.6</td><td>1,212</td><td>$0.96</td></tr>
          <tr><td>Brady Apt Flinders Street</td><td>$1,030</td><td>$26,280</td><td>25.5×</td><td class="pos">3.9%</td><td>47.8</td><td>1,803</td><td>$0.57</td></tr>
          <tr><td>Brady Group (cross-portfolio)</td><td>$2,046</td><td>$28,049</td><td class="neg">13.7×</td><td class="neg">7.3%</td><td>85.5</td><td>4,495</td><td>$0.46</td></tr>
        </tbody>
        <tfoot><tr><td>Total</td><td>$7,151</td><td>$166,996</td><td>23.4×</td><td class="pos">4.3%</td><td>362.6</td><td>11,002</td><td>$0.65</td></tr></tfoot>'''
new = '''        <tbody>
          <tr><td>Brady Apt Hardware Lane</td><td>$1,499</td><td>$43,351</td><td class="pos">28.9×</td><td class="pos">3.5%</td><td>74.3</td><td>1,648</td><td>$0.91</td></tr>
          <tr><td>Brady Apt Flinders Street</td><td>$1,072</td><td>$30,544</td><td class="pos">28.5×</td><td class="pos">3.5%</td><td>57.3</td><td>1,896</td><td>$0.57</td></tr>
          <tr><td>Brady Hotels Central Melbourne</td><td>$1,592</td><td>$44,227</td><td class="pos">27.8×</td><td class="pos">3.6%</td><td>87.2</td><td>2,107</td><td>$0.76</td></tr>
          <tr><td>Brady Hotels Jones Lane</td><td>$1,229</td><td>$33,412</td><td>27.2×</td><td class="pos">3.7%</td><td>90.6</td><td>1,302</td><td>$0.94</td></tr>
          <tr><td>Brady Group (cross-portfolio)</td><td>$2,150</td><td>$47,149</td><td>21.9×</td><td class="pos">4.6%</td><td>92.1</td><td>4,768</td><td>$0.45</td></tr>
        </tbody>
        <tfoot><tr><td>Total</td><td>$7,542</td><td>$198,683</td><td class="pos">26.3×</td><td class="pos">3.8%</td><td>401.5</td><td>11,721</td><td>$0.64</td></tr></tfoot>'''
if old in content: content = content.replace(old, new); changes += 1; print('✓ SEM Per Hotel — table updated')
else: print('✗ SEM Per Hotel — table NOT found')

# SEM action card
old = '<strong>Top performers:</strong> Brady Central + Hardware Lane both at 28×+ ROAS — major scale opportunity. <strong>Brady Group at 13.7×</strong> — Brand search holds, PMAX + Display Retargeting underperform.'
new = '<strong>All hotels 27–29× ROAS</strong> — Hardware Lane 28.9× + Flinders 28.5× + Central 27.8× + Jones 27.2× all at scale. <strong>Brady Group 21.9×</strong> — Display Retargeting ($291 combined spend, near-zero conversions) flagged for pause; rest is solid brand + PMAX.'
if old in content: content = content.replace(old, new); changes += 1; print('✓ SEM Per Hotel — action card updated')
else: print('✗ SEM Per Hotel — action card NOT found')

# ═══════════════════════════════════════════════════════════════════════════════
# 3. SOCIAL PER HOTEL SLIDE — Replace entire table with real Windsor data
# ═══════════════════════════════════════════════════════════════════════════════
old = '''      <table class="dt anim d2">
        <thead><tr><th>Hotel / Group</th><th>Spend</th><th>Att. Rev</th><th>ROAS</th><th>CoS %</th><th>Clicks</th><th>CTR</th><th>CPC</th></tr></thead>
        <tbody>
          <tr><td>Brady Apt Flinders Street</td><td>$1,121</td><td class="pos">$5,800</td><td class="pos">5.2×</td><td class="pos">19.3%</td><td>1,241</td><td>1.65%</td><td>$0.90</td></tr>
          <tr><td>Brady Apt Hardware Lane</td><td>$1,018</td><td class="pos">$5,200</td><td class="pos">5.1×</td><td class="pos">19.6%</td><td>1,304</td><td class="pos">1.85%</td><td class="pos">$0.78</td></tr>
          <tr><td>Brady Hotels Jones Lane</td><td>$911</td><td>$4,200</td><td>4.6×</td><td>21.7%</td><td>998</td><td>1.56%</td><td>$0.91</td></tr>
          <tr><td>Brady Hotels Central Melbourne</td><td>$676</td><td class="neg">$2,900</td><td class="neg">4.3×</td><td class="neg">23.3%</td><td>657</td><td class="neg">1.33%</td><td class="neg">$1.03</td></tr>
          <tr><td>Brady Group (cross-portfolio)</td><td>$1,362</td><td>$5,900</td><td>4.3×</td><td class="neg">23.1%</td><td>1,719</td><td>1.44%</td><td>$0.79</td></tr>
        </tbody>
        <tfoot><tr><td>Total</td><td>$5,089</td><td>$24,000</td><td>4.7×</td><td class="neg">21.2%</td><td>5,919</td><td>1.57%</td><td>$0.86</td></tr></tfoot>
      </table>'''
new = '''      <table class="dt anim d2">
        <thead><tr><th>Hotel / Group</th><th>Spend</th><th>Att. Rev</th><th>Bookings</th><th>ROAS</th><th>CoS %</th><th>Clicks</th><th>CTR</th><th>CPC</th></tr></thead>
        <tbody>
          <tr><td>Brady Hotels Jones Lane</td><td>$987</td><td class="pos">$25,130</td><td>53</td><td class="pos">25.5×</td><td class="pos">3.9%</td><td>1,117</td><td>1.62%</td><td>$0.88</td></tr>
          <tr><td>Brady Apt Hardware Lane</td><td>$1,093</td><td class="pos">$23,461</td><td>45</td><td class="pos">21.5×</td><td class="pos">4.7%</td><td>1,395</td><td class="pos">1.86%</td><td class="pos">$0.78</td></tr>
          <tr><td>Brady Group (cross-portfolio)</td><td>$1,463</td><td class="pos">$28,480</td><td>51</td><td class="pos">19.5×</td><td class="pos">5.1%</td><td>1,840</td><td>1.45%</td><td>$0.79</td></tr>
          <tr><td>Brady Apt Flinders Street</td><td>$1,192</td><td>$18,390</td><td>39</td><td>15.4×</td><td>6.5%</td><td>1,315</td><td>1.66%</td><td>$0.91</td></tr>
          <tr><td>Brady Hotels Central Melbourne</td><td>$718</td><td class="neg">$7,512</td><td>17</td><td class="neg">10.5×</td><td class="neg">9.6%</td><td>715</td><td class="neg">1.38%</td><td class="neg">$1.00</td></tr>
        </tbody>
        <tfoot><tr><td>Total</td><td>$5,452</td><td>$102,972</td><td>205</td><td class="pos">18.9×</td><td class="pos">5.3%</td><td>6,382</td><td>1.59%</td><td>$0.85</td></tr></tfoot>
      </table>'''
if old in content: content = content.replace(old, new); changes += 1; print('✓ Social Per Hotel — table updated')
else: print('✗ Social Per Hotel — table NOT found')

# Social Per Hotel action card
old = '<strong>Note:</strong> Revenue = Meta-attributed (view + click). Promo campaigns rolled into hotel of attribution; Brand promos into Brady Group. <strong>Membership Lead campaign</strong> in Group totals — see separate slide.'
new = '<strong>Data source: Windsor.ai · Meta Ads · April 2026.</strong> Revenue = Meta full-attribution (click + view). Seasonal promos (Autumn Sale + Easter) attributed to respective hotel. <strong>Jones Lane leads ROAS at 25.5×</strong> · Hardware 21.5× — both strong. Central Melbourne 10.5× needs campaign review. Members: 30 leads · $9.87 CPL — see next slide.'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Social Per Hotel — action card updated')
else: print('✗ Social Per Hotel — action card NOT found')

# ═══════════════════════════════════════════════════════════════════════════════
# 4. MEMBERSHIP CAMPAIGN SLIDE — Update with real Windsor data (30 leads)
# ═══════════════════════════════════════════════════════════════════════════════

# Spend (was $295, Windsor = $296.13)
old = '        <div class="kpi-strip-card social"><div class="ks-label">Spend</div><div class="ks-value">$295</div></div>'
new = '        <div class="kpi-strip-card social"><div class="ks-label">Spend</div><div class="ks-value">$296</div></div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — Spend updated')
else: print('✗ Membership — Spend NOT found')

# Impressions (was 11,759, Windsor = 11,790)
old = '        <div class="kpi-strip-card social"><div class="ks-label">Impressions</div><div class="ks-value">11,759</div></div>'
new = '        <div class="kpi-strip-card social"><div class="ks-label">Impressions</div><div class="ks-value">11,790</div></div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — Impressions updated')
else: print('✗ Membership — Impressions NOT found')

# CPC (was $1.64, Windsor = $1.65)
old = '        <div class="kpi-strip-card social"><div class="ks-label">CPC</div><div class="ks-value">$1.64</div></div>'
new = '        <div class="kpi-strip-card social"><div class="ks-label">CPC</div><div class="ks-value">$1.65</div></div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — CPC updated')
else: print('✗ Membership — CPC NOT found')

# Leads: "Pull from Meta ↗" → "30"
old = '        <div class="kpi-strip-card social"><div class="ks-label">Leads</div><div class="ks-value pos">Pull from Meta ↗</div></div>'
new = '        <div class="kpi-strip-card social"><div class="ks-label">Leads</div><div class="ks-value pos">30</div></div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — Leads updated to 30')
else: print('✗ Membership — Leads NOT found')

# CPL: "Pull from Meta ↗" → "$9.87"
old = '        <div class="kpi-strip-card social"><div class="ks-label">CPL</div><div class="ks-value pos">Pull from Meta ↗</div></div>'
new = '        <div class="kpi-strip-card social"><div class="ks-label">CPL</div><div class="ks-value pos">$9.87</div></div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — CPL updated to $9.87')
else: print('✗ Membership — CPL NOT found')

# Membership note (update the warning about needing to pull data)
old = '            <div style="margin-top:0.5rem;color:var(--text-muted);font-size:var(--fs-label);line-height:1.5">⚠ Actual lead count &amp; CPL to be confirmed: pull the Lead Generation report from Meta Ads Manager (Campaigns → Leads column) for exact delivered lead count and CPL.</div>'
new = '            <div style="margin-top:0.5rem;color:var(--pos);font-size:var(--fs-label);line-height:1.5;font-weight:600">✓ Confirmed via Windsor.ai · Meta Ads API: 30 leads at $9.87 CPL. Lead form submissions tracked as Meta Leads event — purchase attribution (1 booking) is incidental.</div>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — confirmation note updated')
else: print('✗ Membership — confirmation note NOT found')

# Membership May plan: update target now that we have 30 as baseline
old = '              <li><strong>Budget:</strong> $295 → $385 · target 35–50 leads</li>'
new = '              <li><strong>Budget:</strong> $296 → $385 · April baseline 30 leads · target 40–50 leads</li>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Membership — May plan budget updated')
else: print('✗ Membership — May plan budget NOT found')

# ═══════════════════════════════════════════════════════════════════════════════
# 5. WHAT WE DO NEXT — PAID CHANNELS — Update Social projection line
# ═══════════════════════════════════════════════════════════════════════════════
old = '          <strong>③ Social</strong> — projected <span class="pos" style="font-weight:600">+$11K att. rev</span>'
new = '          <strong>③ Social</strong> — April base $103K att. rev · projected <span class="pos" style="font-weight:600">+$15K May uplift</span>'
if old in content: content = content.replace(old, new); changes += 1; print('✓ Paid next steps — Social projection updated')
else: print('✗ Paid next steps — Social projection NOT found')

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Write output
# ═══════════════════════════════════════════════════════════════════════════════
with open('public/slides/brady-april-2026-hybrid.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n✓ {changes} changes applied.')
print('Done.')
