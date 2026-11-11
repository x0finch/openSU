// Sheet typography and spacing tokens: the only place for sizes, positions
// and type of the shareable sheets. Colours and font stacks come from the
// plan palette (`@opensu/plan` tokens) so sheet and plan read as one set.
//
// Lengths are page px at the nominal 1500 x 2000 sheet; `scale: 2` renders
// everything at twice the resolution with the same layout.
import { tokens as plan } from '@opensu/plan';

export const page = {
  width: 1500,
  height: 2000,
  background: plan.color.page,
} as const;

export const color = {
  title: plan.color.title,
  fact: plan.color.ink,
  divider: plan.color.ink,
  footer: plan.color.subtitle,
  groundLine: plan.color.ink,
} as const;

/** Latin first so digits and ASCII come from the Latin face; CJK falls through. */
const stack = `${plan.font.latin},${plan.font.cjk}`;

export const font = {
  family: stack,
  titleSize: 58,
  /** A longer title is set smaller to stay within this width... */
  titleMaxWidth: 760,
  /** ...but never below this size. */
  titleMinSize: 34,
  titleWeight: 400,
  /** Extra tracking of the title, in em. */
  titleTracking: 0.04,
  factSize: 30,
  factWeight: 400,
  /** Baseline-to-baseline distance of the fact lines. */
  factLeading: 62,
  footerSize: 17,
  footerTracking: 0.12,
} as const;

export const layout = {
  /** Left / right page margin; title, facts and footer align to it. */
  marginX: 64,
  /** Title baseline. */
  titleBaseline: 118,
  /** First fact baseline (then `font.factLeading` apart). */
  firstFactBaseline: 212,
  /** Top of the area a hero view may use (beside the header). */
  heroTop: 96,
  /** Widest a hero view may be drawn (the references keep ~70% of the page width). */
  heroMaxWidth: 1160,
  /** Widest the lower view of a views sheet may be drawn. */
  lowerViewMaxWidth: 1260,
  /** Divider position as a fraction of the page height, per sheet kind. */
  dividerLevel: 0.46,
  /** Plans of a set: the widest level should span this share of the page width... */
  planWidthTarget: 0.78,
  /** ...for which the divider of the level sheets may move up to here (the hero keeps the rest). */
  dividerLevelMin: 0.37,
  dividerViews: 0.5,
  divider: 1.2,
  /** White space between a drawing and the divider. */
  gapAboveDivider: 44,
  gapBelowDivider: 36,
  /** Lowest point of the lower drawing. */
  bottom: 1968,
  /** Footer mark baseline (right-aligned to the margin). */
  footerBaseline: 1966,
  /** Clearance kept between header text and any ink of the hero view. */
  headerClearance: 30,
  /** White border rendered around a drawing's ink (keeps anti-aliasing intact). */
  inkPad: 6,
  /** Probe render size (longest side, px) used to find a view's ink. */
  probeSize: 720,
  /** Camera margin of the probe (wider than the viewer's, so entourage is not clipped). */
  probeMargin: 0.16,
  /** Ground line under elevation views: thickness and run past the drawing on each side. */
  groundLine: 1.6,
  groundLineOverhang: 36,
  /** Plan text size relative to the screen plan (`@opensu/plan` textScale). */
  planTextScale: 1.7,
} as const;

/** A pixel counts as ink when any channel is below this. */
export const inkThreshold = 250;
