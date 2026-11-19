// Base UI's Popover and Menu trees and the Vaul sheet load on first use
// (task 031: they are not needed to draw a page). The glass layer fetches
// them once the page is idle, so a first open does not wait for them.
import { preloadToast } from './toast';
import { preloadTooltip } from './tooltip';

export function preloadSurfaces(): void {
  void preloadTooltip();
  void preloadToast();
  void import('./dialog-base');
  void import('./menu-base');
  void import('./popover-base');
}
