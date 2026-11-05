"""Regenerates test/fixtures/czech.pdf (2 pages, Czech text with a real font + ToUnicode map).
Run: python3 test/fixtures/make-czech-pdf.py  (needs reportlab and DejaVu Sans)."""
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
out = Path(__file__).with_name("czech.pdf")
c = canvas.Canvas(str(out), pagesize=(595, 842), invariant=1)
c.setFont("DejaVu", 14)
c.drawString(72, 760, "Přihláška do výběrového řízení")
c.drawString(72, 736, "Žluťoučký kůň úpěl ďábelské ódy.")
c.showPage()
c.setFont("DejaVu", 12)
c.drawString(72, 760, "Smlouva o dílo: Stavební úpravy střechy, Brno")
c.save()
print(out, out.stat().st_size)
