// Base UI's Popover and Menu trees and the Vaul sheet load on first use
// (task 031: they are not needed to draw a page). The glass layer fetches
// them once the page is idle, so a first open does not wait for them.
export function preloadSurfaces(): void {
  void import('./menu-base');
  void import('./popover-base');
}
