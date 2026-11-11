// Counts the interactive controls a user can see (run in the page with
// page.evaluate). `elements`: every visible button, link, field and segment
// (each option of a segmented control counts); `widgets`: the same with a
// radio group counted once (one tab stop, as WAI-ARIA defines it).
export function countControls() {
  const sel = 'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=radio], [role=slider], [role=tab], [role=menuitem], [role=switch], [role=application]';
  const els = [...document.querySelectorAll(sel)].filter((el) => {
    if (el.closest('[inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return !el.parentElement?.closest(sel);
  });
  const widgets = new Set(els.map((el) => el.closest('[role=radiogroup]') ?? el));
  return { elements: els.length, widgets: widgets.size, list: els.map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24)) };
}
