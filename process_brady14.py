"""
process_brady14.py
─────────────────────────────────────────────────────────────────────────────
Remove slides 35 (Brand vs Generic), 36 (Organic Sessions YoY),
and 48 (Forecast per Hotel × Channel), then renumber to 45 total.
─────────────────────────────────────────────────────────────────────────────
"""
import re

SRC = 'public/slides/brady-april-2026-hybrid.html'

with open(SRC, encoding='utf-8') as f:
    html = f.read()

# Each slide to delete: identified by the HTML comment just before its <section>
SLIDE_35_ANCHOR = '<!-- ════ 34. SEO — BRAND vs GENERIC ════ -->'
SLIDE_36_ANCHOR = '<!-- ════ 35. SEO — ORGANIC TRAFFIC YoY ════ -->'
SLIDE_48_ANCHOR = '<!-- ════ 33. FORECAST PER HOTEL × CHANNEL MATRIX -->'

def remove_slide(content, anchor):
    """Remove the <section>…</section> block that follows anchor."""
    pos = content.find(anchor)
    assert pos != -1, f'Anchor not found: {anchor}'
    # Walk forward to the opening <section
    sec_start = content.find('<section', pos)
    assert sec_start != -1, 'No <section> after anchor'
    # Walk forward to the closing </section>
    sec_end = content.find('</section>', sec_start) + len('</section>')
    # Consume trailing newline if present
    if content[sec_end:sec_end+1] == '\n':
        sec_end += 1
    removed_len = sec_end - pos
    print(f'  Removing: {anchor[:55]}… ({removed_len} chars)')
    return content[:pos] + content[sec_end:]

# Remove in REVERSE document order to keep positions valid
print('Removing slides…')
html = remove_slide(html, SLIDE_48_ANCHOR)   # slide 48 — highest in doc (last section)
html = remove_slide(html, SLIDE_36_ANCHOR)   # slide 36
html = remove_slide(html, SLIDE_35_ANCHOR)   # slide 35

# Renumber slide-num divs
print('\nRenumbering slides…')
pattern = re.compile(r'<div class="slide-num">.*?</div>', re.DOTALL)
matches = list(pattern.finditer(html))
total   = len(matches)
print(f'  Found {total} slide-num divs → renumbering 01/{total:02d}…{total:02d}/{total:02d}')

result, prev_end = [], 0
for i, m in enumerate(matches, 1):
    result.append(html[prev_end:m.start()])
    result.append(f'<div class="slide-num">{i:02d} / {total:02d}</div>')
    prev_end = m.end()
result.append(html[prev_end:])
html = ''.join(result)

# Update the hardcoded "/ 48" in the notes popup JS (Slide XX / 48 labels)
html = html.replace('" / 48";', f'" / {total:02d}";')
html = html.replace('"0")+" / 48";', f'"0")+" / {total:02d}";')
# Also fix the notesUpdate label
html = html.replace("' / 48'", f"' / {total:02d}'")
# Fix the hardcoded total in bradySendNotes / renderNote areas
old_total_str = '+" / 48";'
new_total_str = f'+" / {total:02d}";'
html = html.replace(old_total_str, new_total_str)

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'\n✓ Done — {total} slides. Saved: {SRC}')
