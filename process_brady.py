#!/usr/bin/env python3
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/slides/brady-april-2026-hybrid.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Add .kpi-select CSS ──
css_inject = """    .kpi-select {
      font-family: var(--font-body); font-size: var(--fs-label); font-weight: 600;
      color: var(--ch-meta); background: rgba(93,200,197,0.10);
      border: 1px solid rgba(93,200,197,0.35); border-radius: 4px;
      padding: 0.15rem 0.45rem; cursor: pointer; outline: none;
      appearance: none; -webkit-appearance: none; letter-spacing: 0.04em;
    }
    .kpi-select:focus { border-color: var(--ch-meta); }
"""
needle = '    .kpi-strip-card .ks-value.pos { color: var(--pos); }'
if needle in content:
    content = content.replace(needle, needle + '\n' + css_inject)
    print("✓ CSS added")
else:
    print("✗ CSS anchor not found")

# ── 2. TOC: remove "Funnel strategy" from SEM list ──
old = '            <li>Per hotel · Breakdowns</li>\n            <li>Funnel strategy</li>\n            <li>Action plan · Assets</li>'
new = '            <li>Per hotel · Breakdowns</li>\n            <li>Action plan · Assets</li>'
if old in content:
    content = content.replace(old, new)
    print("✓ TOC SEM funnel removed")
else:
    print("✗ TOC SEM funnel NOT found - trying ASCII")
    old2 = '            <li>Per hotel · Breakdowns</li>\n            <li>Funnel strategy</li>\n            <li>Action plan · Assets</li>'
    new2 = '            <li>Per hotel · Breakdowns</li>\n            <li>Action plan · Assets</li>'
    if old2 in content:
        content = content.replace(old2, new2)
        print("✓ TOC SEM funnel removed (ASCII)")
    else:
        print("✗ TOC SEM funnel still NOT found")

# ── 3. TOC: "Funnel · Membership" → "Membership" ──
if '<li>Funnel · Membership</li>' in content:
    content = content.replace('<li>Funnel · Membership</li>', '<li>Membership</li>')
    print("✓ TOC Social funnel updated")
elif '<li>Funnel · Membership</li>' in content:
    content = content.replace('<li>Funnel · Membership</li>', '<li>Membership</li>')
    print("✓ TOC Social funnel updated (ASCII)")
else:
    print("✗ TOC Social funnel NOT found")

# ── 4. SEM action plan title ──
old_t = '<h2 class="slide-title anim d2">Scale &amp; Underperforming — by Hotel + Funnel</h2>'
new_t = '<h2 class="slide-title anim d2">Scale &amp; Underperforming — by Hotel</h2>'
if old_t in content:
    content = content.replace(old_t, new_t)
    print("✓ SEM action plan title updated")
else:
    # try with ASCII em-dash
    old_t2 = '<h2 class="slide-title anim d2">Scale &amp; Underperforming — by Hotel + Funnel</h2>'
    new_t2 = '<h2 class="slide-title anim d2">Scale &amp; Underperforming — by Hotel</h2>'
    if old_t2 in content:
        content = content.replace(old_t2, new_t2)
        print("✓ SEM action plan title updated (ASCII)")
    else:
        print("✗ SEM action plan title NOT found")

old_th = '<thead><tr><th>Hotel — Funnel</th>'
new_th = '<thead><tr><th>Hotel / Campaign</th>'
if old_th in content:
    content = content.replace(old_th, new_th)
    print("✓ SEM table header updated")
else:
    old_th2 = '<thead><tr><th>Hotel — Funnel</th>'
    if old_th2 in content:
        content = content.replace(old_th2, new_th)
        print("✓ SEM table header updated (ASCII)")
    else:
        print("✗ SEM table header NOT found")

# ── 5. Replace Metasearch Breakdowns slide (18) ──
old_18_start = '<!-- ════ 18. METASEARCH BREAKDOWNS ════ -->'
old_18_end_a = '  <div class="slide-num">18 / 40</div>\n</section>'

idx_start = content.find(old_18_start)
# also try ASCII
if idx_start == -1:
    old_18_start = '<!-- ════ 18. METASEARCH BREAKDOWNS ════ -->'
    idx_start = content.find(old_18_start)

idx_end = content.find(old_18_end_a)
if idx_start != -1 and idx_end != -1:
    idx_end += len(old_18_end_a)
    new_slide18 = """<!-- ════ 18. METASEARCH BREAKDOWNS ════ -->
<section class="slide">
  <div class="slide-inner">
    <div class="slide-header">
      <div class="slide-eyebrow meta anim d1">Metasearch · April 2026 · Breakdowns</div>
      <h2 class="slide-title anim d2">Where Bookings Come From</h2>
    </div>
    <div class="slide-content">
      <div class="chart-grid-2">
        <div class="chart-card meta anim d2">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.35rem">
            <div class="ch-sub" style="margin-bottom:0">By Channel</div>
            <select class="kpi-select" onchange="metaKPI('ch',this.value)">
              <option value="rev" selected>Revenue</option>
              <option value="spend">Spend</option>
              <option value="roas">ROAS</option>
            </select>
          </div>
          <div class="ch-title" id="meta-ch-title">Google Hotel Ads dominates</div>
          <div class="ch-body">
            <div class="hbar" id="meta-ch-bars"></div>
            <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.6rem;line-height:1.4" id="meta-ch-note"><strong style="color:var(--pos)">Action:</strong> Tripadvisor +$300 budget · scale Google Hotel Ads</div>
          </div>
        </div>
        <div class="chart-card meta anim d3">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.35rem">
            <div class="ch-sub" style="margin-bottom:0">By Link Type</div>
            <select class="kpi-select" onchange="metaKPI('lt',this.value)">
              <option value="rev" selected>Revenue</option>
              <option value="spend">Spend</option>
              <option value="roas">ROAS</option>
            </select>
          </div>
          <div class="ch-title" id="meta-lt-title">Free links drive 43% of revenue</div>
          <div class="ch-body">
            <div class="hbar" id="meta-lt-bars"></div>
            <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.6rem;line-height:1.4" id="meta-lt-note"><strong style="color:var(--pos)">Action:</strong> Activate more free booking link placements</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="section-tag meta">Metasearch</div>
  <div class="slide-num">18 / 39</div>
</section>
<script>
(function(){
  var D={
    ch:{
      rev:{title:'Google Hotel Ads dominates',note:'<strong style="color:var(--pos)">Action:</strong> Tripadvisor +$300 budget · scale Google Hotel Ads',rows:[
        {l:'Google',v:'$46.6K · 87%',bar:100,c:'meta'},
        {l:'Trivago',v:'$6.5K · 12%',bar:14,c:'pos'},
        {l:'Tripadvisor',v:'$466 · 1%',bar:1,c:'meta'}
      ]},
      spend:{title:'Google is the main CPC investment',note:'<strong style="color:var(--pos)">Action:</strong> Test Tripadvisor +$300 to diversify paid mix',rows:[
        {l:'Google (CPC)',v:'$1,628',bar:100,c:'meta'},
        {l:'Trivago',v:'$0 · Free',bar:0,c:'pos'},
        {l:'Tripadvisor',v:'$12',bar:0.7,c:'meta'}
      ]},
      roas:{title:'Organic channels have infinite ROAS',note:'<strong style="color:var(--pos)">Action:</strong> Grow free booking link share — zero cost, pure revenue',rows:[
        {l:'Google',v:'28.6×',bar:74,c:'meta'},
        {l:'Trivago ★',v:'∞ · Free',bar:100,c:'pos'},
        {l:'Tripadvisor ★',v:'38.8×',bar:100,c:'pos'}
      ]}
    },
    lt:{
      rev:{title:'Free links drive 43% of revenue',note:'<strong style="color:var(--pos)">Action:</strong> Activate more free booking link placements',rows:[
        {l:'Paid (CPC)',v:'$30.7K · 57%',bar:100,c:'meta'},
        {l:'Organic / Free',v:'$22.9K · 43%',bar:75,c:'pos'}
      ]},
      spend:{title:'All spend is on paid CPC links',note:'<strong style="color:var(--pos)">Action:</strong> Free links cost nothing — maximise their placement',rows:[
        {l:'Paid (CPC)',v:'$1,640',bar:100,c:'meta'},
        {l:'Organic / Free',v:'$0',bar:0,c:'pos'}
      ]},
      roas:{title:'Organic links deliver infinite ROAS',note:'<strong style="color:var(--pos)">Action:</strong> Grow organic link share — best return on zero spend',rows:[
        {l:'Paid (CPC)',v:'18.7×',bar:19,c:'meta'},
        {l:'Organic / Free ★',v:'∞',bar:100,c:'pos'}
      ]}
    }
  };
  function bars(id,rows){
    var el=document.getElementById(id);if(!el)return;
    el.innerHTML=rows.map(function(r){
      return '<div class="hbar-row"><div class="hbar-top"><span class="hbar-label">'+r.l+'</span><span class="hbar-value">'+r.v+'</span></div><div class="hbar-track"><div class="hbar-fill '+r.c+'" style="width:'+r.bar+'%"></div></div></div>';
    }).join('');
  }
  window.metaKPI=function(p,k){
    var d=D[p][k];if(!d)return;
    document.getElementById('meta-'+p+'-title').textContent=d.title;
    document.getElementById('meta-'+p+'-note').innerHTML=d.note;
    bars('meta-'+p+'-bars',d.rows);
  };
  metaKPI('ch','rev'); metaKPI('lt','rev');
})();
</script>"""
    content = content[:idx_start] + new_slide18 + content[idx_end:]
    print("✓ Slide 18 replaced")
else:
    print(f"✗ Slide 18 NOT found (start={idx_start}, end={idx_end})")

# ── 6. Remove Social Funnel Strategy slide (25) ──
end_marker = '  <div class="slide-num">25 / 40</div>\n</section>'
# Try multiple anchor patterns
for anchor in ['<!-- ════ 25. SOCIAL FUNNEL STRATEGY', '<!-- ════ 25. SOCIAL FUNNEL STRATEGY']:
    idx_s = content.find(anchor)
    if idx_s != -1:
        break

idx_e = content.find(end_marker)
if idx_s != -1 and idx_e != -1:
    pre = content.rfind('\n', 0, idx_s)
    idx_e += len(end_marker)
    content = content[:pre] + content[idx_e:]
    print("✓ Slide 25 removed")
else:
    print(f"✗ Slide 25 NOT found (start={idx_s}, end={idx_e})")

# ── 7. Renumber slides 26→25 ... 40→39 ──
for n in range(40, 25, -1):
    old = f'{n} / 40'
    new_s = f'{n-1} / 39'
    count = content.count(old)
    if count:
        content = content.replace(old, new_s)
        print(f"✓ {old} → {new_s} ({count}x)")

# Change remaining / 40 → / 39 (slides 1-24)
remaining = content.count('/ 40')
content = content.replace('/ 40', '/ 39')
print(f"✓ Updated {remaining} remaining '/ 40' → '/ 39'")

with open('public/slides/brady-april-2026-hybrid.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nAll done.")
