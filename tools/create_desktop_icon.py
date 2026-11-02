"""Create L'Atelier's multi-size .ico from the existing dark-gold design system."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "build" / "atelier.ico"

def make(size: int) -> Image.Image:
    scale = size / 256
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(im)
    def v(x): return round(x * scale)
    # Dark umber, parchment paper and muted gold: L'Atelier rather than neon.
    pen.rounded_rectangle((v(5),v(5),v(250),v(250)), radius=v(50),
                          fill="#241D1A")
    pen.rounded_rectangle((v(17),v(17),v(238),v(238)), radius=v(41),
                          outline="#B79B6B",width=max(1,v(4)))
    # An open book in parchment tones.
    pen.rounded_rectangle((v(39),v(94),v(127),v(197)),radius=v(11),
                          fill="#E7D8BA")
    pen.rounded_rectangle((v(129),v(94),v(217),v(197)),radius=v(11),
                          fill="#DBC59C")
    pen.line([(v(128),v(95)),(v(128),v(197))],fill="#8A6C48",width=max(1,v(5)))
    pen.line([(v(58),v(123)),(v(103),v(123))],fill="#897353",width=max(1,v(4)))
    pen.line([(v(58),v(145)),(v(103),v(145))],fill="#897353",width=max(1,v(4)))
    pen.line([(v(151),v(123)),(v(196),v(123))],fill="#897353",width=max(1,v(4)))
    pen.line([(v(151),v(145)),(v(196),v(145))],fill="#897353",width=max(1,v(4)))
    # Tiny six-point star above the book, used as L'Atelier's mark.
    cx,cy=v(128),v(60)
    pen.line([(cx,v(37)),(cx,v(84))],fill="#D9B679",width=max(1,v(5)))
    pen.line([(v(107),cy),(v(149),cy)],fill="#D9B679",width=max(1,v(5)))
    pen.line([(v(113),v(45)),(v(143),v(75))],fill="#D9B679",width=max(1,v(3)))
    pen.line([(v(143),v(45)),(v(113),v(75))],fill="#D9B679",width=max(1,v(3)))
    return im

def main():
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    sizes=[16,24,32,48,64,128,256]
    im=make(256)
    im.save(TARGET,format="ICO",sizes=[(n,n) for n in sizes])
    assert TARGET.stat().st_size>1500
    with Image.open(TARGET) as check:
        assert check.format=="ICO" and (256,256) in check.info["sizes"]
    print("PASS: generated multi-size L'Atelier .ico ("+str(TARGET.stat().st_size)+" bytes)")

if __name__=="__main__": main()
