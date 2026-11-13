// The glass material: every number of the studio's liquid glass, and the
// only place they exist (docs/UI_STYLE.md, "Tokens"). They feed the WebGL
// composite pass (`shaderMaterial`) and the CSS backend (`cssVars`).
import type { GlassMaterial } from '@opensu/render';

export type GlassTone = 'light' | 'dark';
/** A surface's role: a control (thin tint) or a surface holding body text (denser). */
export type GlassRole = 'control' | 'text';

interface Tone {
  tint: [number, number, number];
  tintControl: number;
  tintText: number;
  /** The selected segment's lens adds this much tint over the capsule. */
  tintLens: number;
  /**
   * A light face over a resting lens (selected segment, slider thumb):
   * dark glass lifts its selection with white, light glass needs none
   * (its own white tint does it). The slider thumb is solid at rest.
   */
  lensFace: string;
  thumbFace: string;
  /** Ink of a tooltip (drawn in the glass ink colour), and of anything on an ink fill. */
  tipInk: string;
  saturation: number;
  brightness: number;
  catchLight: number;
  bevel: number;
  shadow: number;
  shadowBlur: number;
  hairline: number;
  ink: string;
  ink2: string;
  /** A row's hover / pressed wash and hairlines inside the glass. */
  rowHover: string;
  rowActive: string;
  separator: string;
}

export const TONES: Record<GlassTone, Tone> = {
  light: {
    tint: [1, 1, 1],
    tintControl: 0.14,
    tintText: 0.42,
    tintLens: 0.55,
    lensFace: 'rgba(255, 255, 255, 0)',
    thumbFace: '#ffffff',
    tipInk: '#ffffff',
    saturation: 1.8,
    brightness: 1.06,
    catchLight: 1,
    bevel: 1,
    shadow: 0.1,
    shadowBlur: 16,
    hairline: 0.12,
    ink: 'rgba(0, 0, 0, 0.86)',
    ink2: 'rgba(60, 60, 67, 0.7)',
    rowHover: 'rgba(0, 0, 0, 0.05)',
    rowActive: 'rgba(0, 0, 0, 0.09)',
    separator: 'rgba(60, 60, 67, 0.16)',
  },
  dark: {
    tint: [30 / 255, 30 / 255, 34 / 255],
    tintControl: 0.55,
    tintText: 0.55,
    tintLens: 0.25,
    lensFace: 'rgba(255, 255, 255, 0)',
    thumbFace: '#ffffff',
    tipInk: '#1c1c1e',
    saturation: 1.6,
    brightness: 0.8,
    catchLight: 0.46,
    bevel: 0.36,
    shadow: 0.22,
    shadowBlur: 14,
    hairline: 0.28,
    ink: 'rgba(255, 255, 255, 0.94)',
    ink2: 'rgba(245, 245, 250, 0.9)',
    rowHover: 'rgba(255, 255, 255, 0.08)',
    rowActive: 'rgba(255, 255, 255, 0.14)',
    separator: 'rgba(235, 235, 245, 0.18)',
  },
};

/** Shape, refraction and motion (same for both tones). */
export const GLASS = {
  /** Frost radius, px: capsules, and panels (a panel morph goes up to this). */
  frostControl: 2,
  frostPanel: 6,
  rimMax: 40,
  rimDivisor: 3.5,
  edgeOffset: 1.1,
  falloff: 2.6,
  dispersion: 0.15,
  merge: 14,
  shadowOffset: 4,
  /** The press light (a soft glow under the pointer). */
  pressLight: 0.22,
  /** Press: the surface grows by this many px on its long side (glisse: 6 pointer, 15 touch). */
  pressGrow: 6,
  pressGrowTouch: 15,
  /** A lifted lens (dragged segment, slider thumb): growth in px, magnification, extra bend and shadow. */
  lensGrowX: 24,
  lensGrowY: 16,
  lensMagnify: 1.18,
  lensBend: 1.8,
  lensLift: 1.4,
  /** A sliding lens stretches by its speed (px per px/s), up to a cap. */
  lensStretch: 0.035,
  lensStretchMax: 26,
  /** A lifted lens is clear: its tint falls to this share. */
  lensClear: 0.12,
  /** Radii, CSS px. */
  radiusPanel: 30,
  radiusText: 26,
} as const;

/** The CSS backend: glasswork's material (tint, `blur() saturate() brightness()`, rim light and bevel). */
export const CSS_BLUR_PX = 2;

export function shaderMaterial(tone: GlassTone, opaque: boolean): GlassMaterial {
  const t = TONES[tone];
  return {
    tint: t.tint,
    saturation: t.saturation,
    brightness: t.brightness,
    catchLight: t.catchLight,
    bevel: t.bevel,
    shadow: t.shadow,
    shadowOffset: GLASS.shadowOffset,
    shadowBlur: t.shadowBlur,
    hairline: t.hairline,
    rimMax: GLASS.rimMax,
    rimDivisor: GLASS.rimDivisor,
    edgeOffset: GLASS.edgeOffset,
    falloff: GLASS.falloff,
    dispersion: GLASS.dispersion,
    merge: GLASS.merge,
    pressLight: GLASS.pressLight,
    opaque,
  };
}

export function tintOf(tone: GlassTone, role: GlassRole): number {
  return role === 'text' ? TONES[tone].tintText : TONES[tone].tintControl;
}

const rgb = (c: [number, number, number]) => c.map((x) => Math.round(x * 255)).join(' ');

/** Custom properties of the glass layer (ink for both backends, the material for the CSS one). */
export function cssVars(tone: GlassTone): Record<string, string> {
  const t = TONES[tone];
  return {
    '--lg-tint': `rgb(${rgb(t.tint)})`,
    '--lg-tint-control': String(t.tintControl),
    '--lg-tint-text': String(t.tintText),
    '--lg-tint-lens': String(t.tintLens),
    '--lg-lens-face': t.lensFace,
    '--lg-thumb-face': t.thumbFace,
    '--lg-tip-ink': t.tipInk,
    '--lg-on-ink': t.tipInk,
    '--lg-sat': String(t.saturation),
    '--lg-bri': String(t.brightness),
    '--lg-blur': `${CSS_BLUR_PX}px`,
    '--lg-catch': String(t.catchLight),
    '--lg-bevel': String(t.bevel),
    '--lg-shadow': String(t.shadow),
    '--lg-shadow-blur': `${t.shadowBlur}px`,
    '--lg-hair': String(t.hairline),
    '--lg-ink': t.ink,
    '--lg-ink-2': t.ink2,
    '--lg-row-hover': t.rowHover,
    '--lg-row-active': t.rowActive,
    '--lg-separator': t.separator,
  };
}
