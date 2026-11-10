#!/usr/bin/env python3
"""Stamp a new cache-busting version on every CSS/JS reference.

GitHub Pages caches files for 10 minutes. Without a version, a phone can load the
new index.html with an old main.js, and new buttons silently do nothing.
Run this before every commit that changes css/ or js/:

    python3 scripts/bump-version.py
"""
import pathlib, re, time

root = pathlib.Path(__file__).resolve().parent.parent
version = time.strftime('%Y%m%d%H%M%S')
pattern = re.compile(r'((?:css|js)/[\w-]+\.(?:css|js)|\./[\w-]+\.js)(\?v=[\w.-]+)?(?=["\'])')
files = [root / 'index.html', *sorted((root / 'js').glob('*.js'))]
for f in files:
    text = f.read_text(encoding='utf-8')
    new = pattern.sub(lambda m: f'{m.group(1)}?v={version}', text)
    if new != text:
        f.write_text(new, encoding='utf-8')
print('version', version)
