// The glass's two data types, owned by this package. A canvas backend (an
// app's renderer) receives `GlassShape[]` and a `GlassMaterial` through the
// registry's `attachCanvas` hook; it conforms to these shapes structurally,
// so the package never imports a renderer.

/** One glass surface, in CSS pixels relative to the canvas' top-left corner. */
export interface GlassShape {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius, CSS px (clamped to half the short side). */
  radius: number;
  /** Tint opacity, 0..1 (capsule thin, text surface denser). */
  tint: number;
  /** Frost (blur) radius, CSS px. */
  frost: number;
  /** Overall opacity of the surface, 0..1 (fades for reduced motion). */
  alpha?: number;
  /**
   * 0 = the chrome layer; 1 = a lens on top of it (the selected segment,
   * a slider thumb), drawn over the layer below with its own rim.
   */
  layer?: 0 | 1;
  /** Magnification inside the shape (1 = none; a lifted lens > 1). */
  magnify?: number;
  /** Extra rim refraction, multiplies the material's (lifted lens > 1). */
  bend?: number;
  /** Extra shadow, multiplies the material's (a lifted lens casts more). */
  lift?: number;
  /** A soft light inside the shape (press), CSS px relative to the canvas; strength 0..1. */
  light?: { x: number; y: number; strength: number };
}

/** The material: every number of the look. */
export interface GlassMaterial {
  /** Tint colour, sRGB 0..1. */
  tint: [number, number, number];
  saturation: number;
  brightness: number;
  /** Rim catch light strength (1 = light glass). */
  catchLight: number;
  /** Bevel band strength. */
  bevel: number;
  /** Shadow opacity (0 4px 16px). */
  shadow: number;
  shadowOffset: number;
  shadowBlur: number;
  /** Outer hairline opacity. */
  hairline: number;
  /** Rim width cap, CSS px, and the divisor of the short side on small shapes. */
  rimMax: number;
  rimDivisor: number;
  /** How far the edge looks inward, in rim widths. */
  edgeOffset: number;
  /** Falloff exponent of the bend: (1 - depth / rim) ^ falloff. */
  falloff: number;
  /** Dispersion: red sampled this share further out, blue this share further in. */
  dispersion: number;
  /** Strength of the press light. */
  pressLight: number;
  /** Reduced transparency: an opaque surface in the tint colour. */
  opaque: boolean;
}
