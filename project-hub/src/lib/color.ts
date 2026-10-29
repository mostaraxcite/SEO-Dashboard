/** Color utilities for validated, contrast-safe workspace branding. */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function luminance([r, g, b]: [number, number, number]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string) {
  const la = luminance(parseHex(a)!), lb = luminance(parseHex(b)!);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(hex: string, target: string, t: number) {
  const a = parseHex(hex)!, b = parseHex(target)!;
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
}

export type BrandPalette = {
  input: string;
  light: { brand: string; hover: string; on: string; soft: string };
  dark: { brand: string; hover: string; on: string; soft: string };
  adjusted: boolean;
};

/**
 * Derives light/dark brand tokens from one workspace color.
 * Guarantees ≥4.5:1 between the button color and its label in both themes,
 * and ≥3:1 against the page surface, darkening/lightening the input if needed.
 */
export function brandPalette(input: string): BrandPalette | null {
  if (!parseHex(input)) return null;
  const base = input.toLowerCase();
  let light = base;
  let adjusted = false;
  for (let i = 0; i < 20 && (contrast(light, "#ffffff") < 4.5); i++) {
    light = mix(light, "#000000", 0.08);
    adjusted = true;
  }
  let dark = base;
  for (let i = 0; i < 30 && contrast(dark, "#1a201e") < 4.5; i++) dark = mix(dark, "#ffffff", 0.08);
  return {
    input: base,
    adjusted,
    light: { brand: light, hover: mix(light, "#000000", 0.18), on: "#ffffff", soft: mix(light, "#ffffff", 0.9) },
    dark: {
      brand: dark,
      hover: mix(dark, "#ffffff", 0.15),
      on: contrast(dark, "#ffffff") >= 4.5 ? "#ffffff" : "#121715",
      soft: mix(dark, "#1a201e", 0.82),
    },
  };
}

export function brandStyle(input: string | null | undefined): Record<string, string> {
  const p = input ? brandPalette(input) : null;
  if (!p) return {};
  return {
    "--tb": p.light.brand,
    "--tb-hover": p.light.hover,
    "--tb-on": p.light.on,
    "--tb-soft": p.light.soft,
    "--tbd": p.dark.brand,
    "--tbd-hover": p.dark.hover,
    "--tbd-on": p.dark.on,
    "--tbd-soft": p.dark.soft,
  };
}
