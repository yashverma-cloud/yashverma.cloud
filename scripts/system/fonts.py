"""
Builds the Altitude type system's font files from their OFL sources: subset, trimmed to the
axis ranges the design uses, and written as woff2 for the site and as static woff instances
for the build-time image renderers (Satori cannot read woff2 or variable fonts).

    python3 -m venv .cache/venv-fonts
    .cache/venv-fonts/bin/pip install fonttools brotli
    .cache/venv-fonts/bin/python scripts/system/fonts.py [--src DIR]

Sources are downloaded once into .cache/fonts/ (or read from --src) and checked against the
SHA-256 sums below, so a rebuild is byte-for-byte reproducible or fails loudly.
"""

import argparse
import hashlib
import io
import shutil
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'fonts'
WEB = ROOT / 'public' / 'fonts'
STATIC = ROOT / 'src' / 'system' / 'fonts'

GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
SOURCES = {
    'archivo': (f'{GF}/archivo/Archivo%5Bwdth,wght%5D.ttf', '0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053'),
    'b612mono': (f'{GF}/b612mono/B612Mono-Regular.ttf', 'b98cb96cc8a6206dae08c063d60902df7e6d40f86139ebdb97256704253c9c69'),
    'anek': (f'{GF}/anekdevanagari/AnekDevanagari%5Bwdth,wght%5D.ttf', 'b88cf0ff5705599b2f16fce4ba9ce2029f76106dd24f0419976c417d89f20888'),
}
LICENCES = {
    'archivo': f'{GF}/archivo/OFL.txt',
    'b612mono': f'{GF}/b612mono/OFL.txt',
    'anek': f'{GF}/anekdevanagari/OFL.txt',
}

# The same Latin range Fontsource ships as "latin".
LATIN = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100))
    + [0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC, 0x304, 0x308, 0x329]
    + list(range(0x2000, 0x2070))
    + [0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD]
)
# The only Devanagari on the site: the footer's last line.
SANSKRIT = 'साम्ब सदाशिव'


def source(name: str, src: Path | None) -> Path:
    url, digest = SOURCES[name]
    file = (src or CACHE) / (url.rsplit('/', 1)[1].replace('%5B', '[').replace('%5D', ']'))
    if src is None and not file.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url) as r:
            file.write_bytes(r.read())
    if hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        sys.exit(f'{file.name}: checksum mismatch; the upstream file has changed')
    return file


def instance(path: Path, axes: dict) -> TTFont:
    """Pins or narrows a variable font's axes. Saved and reloaded, because the instancer
    leaves a lazily loaded variations table the subsetter cannot read."""
    buf = io.BytesIO()
    instancer.instantiateVariableFont(TTFont(path), axes).save(buf)
    buf.seek(0)
    return TTFont(buf)


def write(font: TTFont, unicodes: list[int] | None, out: Path, flavor: str, text: str = '', features: list[str] | None = None) -> None:
    opts = subset.Options()
    opts.flavor = flavor
    opts.name_IDs = ['*']  # keep the copyright and licence records the OFL asks for
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.layout_features = features or [
        'kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'tnum', 'lnum', 'pnum', 'zero',
    ]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes or [], text=text)
    sub.subset(font)
    out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = flavor
    font.save(out)
    print(f'  {out.relative_to(ROOT)}  {out.stat().st_size / 1024:.1f} KB')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', type=Path, help='directory holding already-downloaded sources')
    args = ap.parse_args()
    archivo = source('archivo', args.src)
    b612 = source('b612mono', args.src)
    anek = source('anek', args.src)

    print('Web fonts (public/fonts):')
    # Archivo, one variable file for display and text: weight 200 to 700, width 100 to 125.
    write(instance(archivo, {'wght': (200, 700), 'wdth': (100, 125)}), LATIN, WEB / 'archivo-latin-var.woff2', 'woff2')
    write(TTFont(b612), LATIN, WEB / 'b612-mono-latin-400.woff2', 'woff2')
    # Anek Devanagari at the weight that matches Archivo's text, with every shaping feature,
    # cut down to the glyphs of one line.
    write(instance(anek, {'wght': 420, 'wdth': 100}), None, WEB / 'anek-devanagari-sa.woff2', 'woff2', text=SANSKRIT, features=['*'])

    print('Static instances for the image renderers (src/system/fonts):')
    statics = {
        'archivo-expanded-300.woff': {'wght': 300, 'wdth': 125},
        'archivo-wide-380.woff': {'wght': 380, 'wdth': 112},
        'archivo-400.woff': {'wght': 400, 'wdth': 100},
        'archivo-600.woff': {'wght': 600, 'wdth': 100},
    }
    for name, axes in statics.items():
        write(instance(archivo, axes), LATIN, STATIC / name, 'woff')
    write(TTFont(b612), LATIN, STATIC / 'b612-mono-400.woff', 'woff')
    write(instance(anek, {'wght': 420, 'wdth': 100}), None, STATIC / 'anek-devanagari-sa.woff', 'woff', text=SANSKRIT, features=['*'])

    # The OFL travels with the fonts.
    for name, url in LICENCES.items():
        local = (args.src / f'{name}__OFL.txt') if args.src else None
        out = STATIC / f'OFL-{name}.txt'
        if local and local.exists():
            shutil.copy(local, out)
        else:
            with urllib.request.urlopen(url) as r:
                out.write_bytes(r.read())


if __name__ == '__main__':
    main()
