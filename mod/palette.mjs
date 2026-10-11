const NEUTRAL_HUE = 34;
const PROPERTIES = ['background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];

function rgbToHls(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, lightness, 0];
  const delta = max - min;
  const saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
  let hue = max === red ? (green - blue) / delta : max === green ? 2 + (blue - red) / delta : 4 + (red - green) / delta;
  hue = ((hue / 6) % 1 + 1) % 1;
  return [hue, lightness, saturation];
}

function hueToRgb(low, high, hue) {
  hue = ((hue % 1) + 1) % 1;
  if (hue < 1 / 6) return low + (high - low) * hue * 6;
  if (hue < 1 / 2) return high;
  if (hue < 2 / 3) return low + (high - low) * (2 / 3 - hue) * 6;
  return low;
}

function hlsToRgb(hue, lightness, saturation) {
  const high = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  return [hueToRgb(low, high, hue + 1 / 3), hueToRgb(low, high, hue), hueToRgb(low, high, hue - 1 / 3)];
}

/** The theme's OSRS brown for a grey or blue-grey colour of the same lightness, or null for an accent colour. */
export function osrsNeutral(red, green, blue) {
  const [hue, lightness, saturation] = rgbToHls(red / 255, green / 255, blue / 255);
  if (saturation >= 0.3 && lightness >= 0.06 && lightness <= 0.98) return null;
  if (saturation > 0.08 && hue * 360 >= 20 && hue * 360 <= 50) return null;
  const targetSaturation = 0.16 + 0.32 * Math.max(0, (lightness - 0.45) / 0.55);
  return hlsToRgb(NEUTRAL_HUE / 360, 0.04 + lightness * 0.95, targetSaturation).map((value) => Math.round(value * 255));
}

/** Recolours greys painted directly on elements (inline styles no stylesheet can reach) in a part of the page. */
export function createRecolorer(window) {
  const applied = new Map();
  return {
    recolor(root) {
      this.recolorElements([root, ...root.querySelectorAll('*')]);
    },
    recolorElements(elements) {
      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const record = applied.get(element) || {};
        for (const property of PROPERTIES) {
          const value = style.getPropertyValue(property);
          if (record[property] === value) continue;
          const match = value.match(/rgba?\(([^)]+)\)/);
          if (!match) continue;
          const [red, green, blue, alpha = 1] = match[1].split(/[\s,/]+/).map(Number);
          const mapped = alpha > 0 && osrsNeutral(red, green, blue);
          if (!mapped) continue;
          const color = alpha < 1 ? `rgba(${mapped.join(', ')}, ${alpha})` : `rgb(${mapped.join(', ')})`;
          element.style.setProperty(property, color, 'important');
          record[property] = color;
        }
        if (Object.keys(record).length) applied.set(element, record);
      }
    },
    clear() {
      for (const [element, record] of applied) Object.keys(record).forEach((property) => element.style.removeProperty(property));
      applied.clear();
    },
  };
}
