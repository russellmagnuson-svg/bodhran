#!/usr/bin/env python3
"""Makes the three small PDFs the checks open in Session Buddies (pdf.js):

  pdf-abc.pdf    two made-up tunes written in ABC as text, one with chords
                 and a note length of a semiquaver, as a tune book printed
                 from ABC would hold them;
  pdf-staff.pdf  a title in large type ("The Kesh") over staves with notes
                 drawn as shapes, as notation software prints a tune;
  pdf-scan.pdf   staves and notes only, no text at all, as a scan is.

Written by hand (no PDF library), so the files are tiny and their contents
plain. Run it from anywhere: python3 tests/fixtures/make-pdfs.py
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def pdf(content, fonts):
    """One A4 page: `content` is its drawing stream; fonts {name: base font}."""
    objs = []
    font_refs = {}
    for name, base in fonts.items():
        objs.append(f'<< /Type /Font /Subtype /Type1 /BaseFont /{base} /Encoding /WinAnsiEncoding >>')
        font_refs[name] = len(objs)  # object number (1-based) of each font
    stream = content.encode('latin-1')
    objs.append(f'<< /Length {len(stream)} >>\nstream\n'.encode('latin-1') + stream + b'\nendstream')
    content_no = len(objs)
    res = ' '.join(f'/{n} {i} 0 R' for n, i in font_refs.items())
    page_no = len(objs) + 1
    pages_no = page_no + 1
    objs.append(f'<< /Type /Page /Parent {pages_no} 0 R /MediaBox [0 0 595 842] '
                f'/Resources << /Font << {res} >> >> /Contents {content_no} 0 R >>')
    objs.append(f'<< /Type /Pages /Kids [{page_no} 0 R] /Count 1 >>')
    objs.append(f'<< /Type /Catalog /Pages {pages_no} 0 R >>')
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        body = o if isinstance(o, bytes) else o.encode('latin-1')
        out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode()
    for off in offsets:
        out += f'{off:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objs) + 1} /Root {len(objs)} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return bytes(out)


def text_lines(lines, x, y, size, font='F1', lead=None):
    lead = lead or size * 1.3
    out = []
    for i, t in enumerate(lines):
        out.append(f'BT /{font} {size} Tf {x} {y - i * lead:.1f} Td ({esc(t)}) Tj ET')
    return '\n'.join(out)


def staves(top, rows=4):
    """Five-line staves with filled note heads on them: shapes, not text."""
    out = ['0 g 0.8 w']
    for r in range(rows):
        y0 = top - r * 90
        for l in range(5):
            y = y0 - l * 7
            out.append(f'60 {y} m 535 {y} l S')
        for k in range(14):
            x = 90 + k * 31
            y = y0 - 28 + ((k * 5) % 9) * 3.5
            # a note head: a small filled ellipse from four curves
            out.append(f'{x - 4} {y} m {x - 4} {y + 3} {x + 4} {y + 3} {x + 4} {y} c '
                       f'{x + 4} {y - 3} {x - 4} {y - 3} {x - 4} {y} c f')
            out.append(f'{x + 4} {y} m {x + 4} {y + 22} l S')
    return '\n'.join(out)


ABC = """X:1
T:The Checker's Jig
R:jig
M:6/8
L:1/8
K:G
|:GAB c2d|e2d B2G|ABA G2E|D2E G3|
GAB c2d|e2d B2G|A2B cBA|1 G3 G2D:|2 G3 G2B||
|:d2e dBG|c2d cAF|d2e dBG|A3 A2B|
d2e dBG|c2d cAF|GAB cBA|1 G3 G2B:|2 G3 G3|]

X:2
T:A Check Reel
R:reel
M:4/4
L:1/16
K:D
|:"D"F2A2 A2F2 "G"G2B2 B2G2|"D"F2A2 A2F2 "A"E2F2 G2E2|
"D"F2A2 A2F2 "G"G2B2 B2d2|"A"c2B2 A2G2 "D"F2D2 D4:|
|:"D"d4 f2d2 "A"c2e2 e2c2|"G"B2d2 d2B2 "D"A2F2 F2A2|
"D"d4 f2d2 "A"c2e2 e2c2|"G"B2A2 G2E2 "D"D4 D4:|""".split('\n')

page = text_lines(['My checks tune book'], 60, 800, 16, 'F2') + '\n' + text_lines(ABC, 60, 770, 10, 'F1', 12.5)
(HERE / 'pdf-abc.pdf').write_bytes(pdf(page, {'F1': 'Courier', 'F2': 'Helvetica-Bold'}))

page = (text_lines(['The Kesh'], 240, 780, 24, 'F2') + '\n' + text_lines(['Jig'], 60, 750, 11, 'F1') + '\n' +
        text_lines(['Trad.'], 500, 750, 11, 'F1') + '\n' + staves(700) + '\n' +
        text_lines(['1'], 290, 40, 9, 'F1'))
(HERE / 'pdf-staff.pdf').write_bytes(pdf(page, {'F1': 'Helvetica', 'F2': 'Times-Bold'}))

(HERE / 'pdf-scan.pdf').write_bytes(pdf(staves(760, 6), {'F1': 'Helvetica'}))
print('wrote', ', '.join(p.name for p in sorted(HERE.glob('pdf-*.pdf'))))
