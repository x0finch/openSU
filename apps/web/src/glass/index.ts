// The studio's liquid glass (task 017): one module. Screens compose these
// primitives; nothing outside this folder styles a chrome surface.
export { cx, Glass, GlassLayer, GlassLens, useGlass, usePress, type GlassProps } from './Glass';
export {
  GlassButton, GlassButtonGroup, GlassChoice, GlassField, GlassGroupButton, GlassIconButton, GlassInputBar, GlassMenu, GlassMenuItem, GlassPopover, GlassRow, GlassSegmented, GlassSep,
  GlassSheet, GlassSlider, GlassSwitch, GlassTextSurface, GlassTip, GlassToast, type GlassSegment, type PopoverProps,
} from './primitives';
export { type Attach, coveredBy, type Placement } from './anchor';
export { glassRegistry, newGroup, type GlassBackend, type GlassTarget } from './registry';
export { GLASS, TONES, type GlassRole, type GlassTone } from './material';
export { Spring, SPRINGS, prefersReducedMotion } from './spring';
export { GlassDisclosureRegion, GlassTurn, type GlassTurnEntry, type GlassTurnProps } from './turn';
