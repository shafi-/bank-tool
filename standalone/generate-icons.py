#!/usr/bin/env python3
"""Generate PWA icons for Bank.Query"""

from PIL import Image, ImageDraw, ImageFont

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

def create_icon(size, maskable=False):
    """Create an icon of the given size"""
    img = Image.new('RGB', (size, size), '#1a1714')
    draw = ImageDraw.Draw(img)

    if maskable:
        # Full background for maskable
        draw.rectangle([(0, 0), (size, size)], fill='#1a1714')
        padding = int(size * 0.15)
    else:
        padding = int(size * 0.08)

    card_size = size - (padding * 2)
    radius = int(size * 0.04)

    # Draw rounded rectangle for red card
    draw.rounded_rectangle(
        [(padding, padding), (padding + card_size, padding + card_size)],
        radius=radius,
        fill='#c8402a'
    )

    # Try to use a nice font, fall back to default
    try:
        font_large = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', int(size * 0.35))
        font_small = ImageFont.truetype('/System/Library/Fonts/Courier.dfont', int(size * 0.22))
    except:
        try:
            font_large = ImageFont.truetype('DejaVuSans-Bold.ttf', int(size * 0.35))
            font_small = ImageFont.truetype('DejaVuSansMono.ttf', int(size * 0.22))
        except:
            font_large = ImageFont.load_default()
            font_small = ImageFont.load_default()

    # Draw "B"
    text = "B"
    bbox = draw.textbbox((0, 0), text, font=font_large)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) / 2
    y = (size * 0.42) - (text_height / 2)
    draw.text((x, y), text, fill='#faf8f5', font=font_large)

    # Draw "$"
    symbol = "$"
    bbox = draw.textbbox((0, 0), symbol, font=font_small)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) / 2
    y = (size * 0.68) - (text_height / 2)
    draw.text((x, y), symbol, fill='#faf8f5', font=font_small)

    return img

def main():
    print("Generating PWA icons...")

    for size in SIZES:
        img = create_icon(size)
        filename = f"icon-{size}.png"
        img.save(filename, "PNG")
        print(f"  Created {filename}")

    # Maskable version
    img = create_icon(512, maskable=True)
    img.save("icon-maskable-512.png", "PNG")
    print(f"  Created icon-maskable-512.png")

    print("Done! All icons generated.")

if __name__ == "__main__":
    main()
