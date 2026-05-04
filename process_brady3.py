#!/usr/bin/env python3
"""Brady slides v3 – insert social funnel slide and final renumber."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/slides/brady-april-2026-hybrid.html', 'r', encoding='utf-8') as f:
    content = f.read()

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
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: reach new audiences · build brand recall · feed mid &amp; bottom funnel</div>
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
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: nurture warm audiences · group enquiries · member sign-ups · event bookings</div>
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
        <div style="font-size:var(--fs-label);color:var(--text-muted);margin-top:0.35rem">Goal: attributed revenue conversion · F45-64 + F65+ high-CTR audiences → direct booking</div>
      </div>

      <div class="action-card social anim d5">
        <strong>Current mix:</strong> Bottom funnel strongest (Hardware &amp; Flinders sales at 5×+ ROAS). Mid-funnel heavy — good for group &amp; events. Top funnel thin. <strong>Action:</strong> Strengthen bottom-funnel hotel-specific campaigns, throttle underperforming mid-funnel promos.
      </div>
    </div>
  </div>
  <div class="section-tag social">Social</div>
  <div class="slide-num">SOCIAL_FUNNEL</div>
</section>
"""

# The Social Breakdowns slide is now 25/40 - insert after it
anchor = '  <div class="slide-num">25 / 40</div>\n</section>\n\n\n<!-- ════ 26. MEMBERSHIP'
if anchor in content:
    content = content.replace(anchor,
        '  <div class="slide-num">25 / 40</div>\n</section>\n' + social_funnel_slide + '\n\n\n<!-- ════ 26. MEMBERSHIP')
    print('✓ Social funnel inserted')
else:
    print('✗ Social funnel anchor NOT found')
    # Debug: show what's around line 1743
    lines = content.split('\n')
    for i, l in enumerate(lines[1740:1755], start=1741):
        print(f'{i}: {repr(l)}')

# Renumber all slides sequentially
pattern = re.compile(r'<div class="slide-num">(.*?)</div>')
matches = list(pattern.finditer(content))
total = len(matches)
new_content = content
offset = 0
for i, m in enumerate(matches):
    slide_num_str = f'{i+1:02d} / {total}'
    old_text = m.group(0)
    new_text = f'<div class="slide-num">{slide_num_str}</div>'
    start = m.start() + offset
    end = m.end() + offset
    new_content = new_content[:start] + new_text + new_content[end:]
    offset += len(new_text) - len(old_text)

content = new_content
print(f'✓ Renumbered {total} slides (01/{total} → {total:02d}/{total})')

with open('public/slides/brady-april-2026-hybrid.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('\nDone.')
