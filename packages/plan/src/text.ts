// Text measurement without a DOM. Widths are conservative: per glyph the
// widest of the fonts in the stacks we ship (Inter, Helvetica/Arial-like,
// DejaVu Sans, WenQuanYi Zen Hei), so boxes used for collision checks are
// never smaller than what a browser draws.

const W: Record<string, number> = {
  '0': 0.64, '1': 0.64, '2': 0.64, '3': 0.64, '4': 0.65, '5': 0.64, '6': 0.64, '7': 0.64, '8': 0.64, '9': 0.64,
  A: 0.69, B: 0.69, C: 0.73, D: 0.77, E: 0.67, F: 0.61, G: 0.78, H: 0.75, I: 0.29, J: 0.57,
  K: 0.67, L: 0.57, M: 0.9, N: 0.76, O: 0.79, P: 0.67, Q: 0.79, R: 0.72, S: 0.67, T: 0.65,
  U: 0.74, V: 0.69, W: 0.99, X: 0.69, Y: 0.68, Z: 0.69,
  ' ': 0.32, '/': 0.52, "'": 0.3, '*': 0.6, '.': 0.32, '-': 0.46, '×': 0.64, ',': 0.32, '(': 0.4, ')': 0.4,
};

const isWide = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f);
};

/** Advance width of `text` in px at `size`, with `tracking` (em) after each glyph. */
export function textWidth(text: string, size: number, tracking = 0): number {
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += isWide(ch) ? 1 : (W[ch] ?? W[ch.toUpperCase()] ?? 0.7);
    n++;
  }
  // Tracking is applied after every glyph; the last one is trimmed when
  // centring (see `trackedAnchorShift`).
  return (w + Math.max(0, n - 1) * tracking) * size;
}

/** Visual box height used for a single line of text: cap/ideograph height plus a little. */
export function textHeight(size: number, cjk: boolean): number {
  return size * (cjk ? 1.0 : 0.78);
}

export const hasWide = (s: string) => [...s].some(isWide);

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
