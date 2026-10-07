"""Rebuild bundled chapters from eBible.org's public-domain VPL archives.

Python 3 and curl are only needed to refresh data, never to run the app.
Use --download to fetch archives; otherwise use the cached .bible-sources zips.
Existing manifest checksums pin the source revision. Review any source change
before removing/updating the manifest to accept a new upstream revision.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.bible-sources'
OUTPUT = ROOT / 'public' / 'bibles' / 'v1'
SOURCES = {
    'KJV': ('eng-kjv', 'King James Version · eBible.org / CrossWire. Public domain outside the UK.'),
    'WEB': ('eng-web', 'World English Bible Classic · eBible.org. Public domain.'),
    'ASV': ('eng-asv', 'American Standard Version (1901) · eBible.org. Public domain.'),
}
ALIASES = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM',
           'MAR': 'MRK', 'JOH': 'JHN', 'PHI': 'PHP', 'JAM': 'JAS',
           '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}
canon = dict((book, int(count)) for book, count in re.findall(
    r'\["(\w{3})", "[^"]+", (\d+)\]', (ROOT / 'src/lib/bible.ts').read_text()))
assert len(canon) == 66 and sum(canon.values()) == 1189
CACHE.mkdir(exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
manifest_path = OUTPUT / 'sources.json'
previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
manifest = {}
for translation, (source, attribution) in SOURCES.items():
    url = f'https://ebible.org/Scriptures/{source}_vpl.zip'
    archive = CACHE / f'{translation.lower()}.zip'
    if '--download' in sys.argv:
        subprocess.run(['curl', '-L', '--fail', '--retry', '2', '-A', 'Mozilla/5.0', url, '-o', str(archive)], check=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if translation in previous and previous[translation]['sha256'] != digest:
        raise ValueError(f'{translation}: upstream archive changed; review before updating the pinned manifest')
    with zipfile.ZipFile(archive) as zipped:
        text = zipped.read(f'{source}_vpl.txt').decode('utf-8-sig')
        # Keep the source notice, including the KJV territorial caveat.
        (OUTPUT / f'{translation}-source-notice.html').write_bytes(zipped.read(f'{source}_about.htm'))
        (OUTPUT / 'haiola.css').write_bytes(zipped.read('haiola.css'))
    books = {book: {} for book in canon}
    for line in text.splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r'(\w{3}) (\d+):(\d+) (.*)', line)
        if not match:
            raise ValueError(f'Unrecognized VPL line: {line[:80]}')
        original, chapter, verse, body = match.groups()
        book = ALIASES.get(original, original)
        if book not in canon:
            continue  # This app uses the 66-book Protestant canon.
        chapter, verse = int(chapter), int(verse)
        assert 1 <= chapter <= canon[book] and 1 <= verse <= 176
        # Preserve text, including supplied-word brackets and Psalm superscriptions.
        assert '\ufffd' not in body
        if not body.strip():
            continue  # Numbering gaps in the source must remain gaps.
        verses = books[book].setdefault(chapter, [])
        assert not verses or verses[-1]['number'] < verse
        verses.append({'number': verse, 'text': body})
    total = 0
    for book, count in canon.items():
        assert sorted(books[book]) == list(range(1, count + 1)), (translation, book)
        directory = OUTPUT / translation / book
        directory.mkdir(parents=True, exist_ok=True)
        for chapter, verses in books[book].items():
            total += len(verses)
            (directory / f'{chapter}.json').write_text(json.dumps(
                {'verses': verses, 'copyright': attribution}, ensure_ascii=False,
                separators=(',', ':')) + '\n', encoding='utf-8')
    manifest[translation] = {'source': url, 'sha256': digest, 'books': 66,
                             'chapters': 1189, 'verses': total,
                             'license': f'https://ebible.org/{source}/copyright.htm'}
    print(f'{translation}: 66 books, 1189 chapters, {total} verses')
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
