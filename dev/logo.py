"""Draw the mod.io logo: a rendered OSRS character in full gear beside the mod title."""
from PIL import Image, ImageChops, ImageDraw, ImageFont

import preview

BACKGROUND = (36, 31, 26)
YELLOW = (255, 255, 0, 255)
ORANGE = (255, 152, 31, 255)
OUTFIT = [1163, 1127, 1079, 1201, 4587, 4131, 7460, 1704, 6568]
CHARACTER_HEIGHT = 640


def character(yaw):
    out = preview.OUT / "logo-character.png"
    preview.OUT.mkdir(parents=True, exist_ok=True)
    preview.shoot(preview.page(OUTFIT, yaw, 96, False, 300, 600, "rgb{}".format(BACKGROUND)), out, 300, 600)
    image = Image.open(out).convert("RGB")
    image = image.crop(ImageChops.difference(image, Image.new("RGB", image.size, BACKGROUND)).getbbox())
    return image.resize((round(image.width * CHARACTER_HEIGHT / image.height), CHARACTER_HEIGHT), Image.LANCZOS)


def draw_logo(yaw):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    figure = character(yaw)
    logo.paste(figure, (210 - figure.width // 2, (720 - figure.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(tag.resize((tag.width * scale, tag.height * scale), Image.NEAREST), (x, y))

    text("OSRS CHARACTER", 400, 270, 9, YELLOW)
    text("Your gear on an OSRS character", 404, 380, 3, ORANGE)
    text("for Melvor Idle", 404, 420, 3, ORANGE)
    return logo


def main():
    out = preview.ROOT / "dist" / "logo.png"
    out.parent.mkdir(exist_ok=True)
    draw_logo(128).convert("RGB").save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
