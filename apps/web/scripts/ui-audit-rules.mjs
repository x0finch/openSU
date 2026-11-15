// In-page measurements for the UI audit (task 024). Every function here is
// serialised into the browser with page.evaluate, so each one must be
// self-contained: no imports, no references to anything outside its body.
//
// measureDom(opts)   runs in the page under test: DOM rules, the boxes the
//                    pixel rules need, the guides for the contact sheet.
// analysePixels(job) runs in a blank analysis page: decodes the state's
//                    screenshots and measures rendered pixels (contrast,
//                    fills, rules, accent share). The page under test is
//                    never touched by the pixel work.

/**
 * DOM rules. `opts`: { phone, minText, hitMin }.
 * Returns { findings, comps, textBoxes, surfaces, nested, fields, disabled,
 * selected, strings, subject, modeSwitch, colours, radii }.
 */
export function measureDom(opts) {
  const VW = innerWidth, VH = innerHeight;
  const R = (v) => Math.round(v * 10) / 10;
  const box = (r) => ({ x: R(r.left), y: R(r.top), w: R(r.width), h: R(r.height) });
  const cs = (el, p) => getComputedStyle(el, p);
  const findings = [];

  // ---- identity -------------------------------------------------------
  const tid = (el) => el.getAttribute && el.getAttribute('data-testid');
  const short = (s, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const label = (el) => el.getAttribute('aria-label') || short((el.innerText || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim());
  const desc = (el) => {
    if (!el || el === document.body) return 'body';
    const t = tid(el);
    if (t) return `[${t}]`;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const l = label(el);
    let up = el.parentElement, anc = null;
    while (up && !anc) {
      if (tid(up)) anc = `[${tid(up)}]`;
      up = up.parentElement;
    }
    return `${anc ? `${anc} ` : ''}${tag}${role ? `[role=${role}]` : ''}${l ? ` "${short(l, 18)}"` : ''}`;
  };
  /** The component an element belongs to: its glass surface (or nearest named ancestor). */
  const comp = (el) => {
    let e = el;
    while (e && e !== document.body) {
      if (e.classList?.contains('lg')) return tid(e) || e.getAttribute('aria-label') || e.getAttribute('role') || 'glass';
      e = e.parentElement;
    }
    e = el;
    while (e && e !== document.body) {
      if (tid(e)) return tid(e);
      e = e.parentElement;
    }
    return location.pathname === '/' ? 'landing' : 'page';
  };

  // ---- visibility -----------------------------------------------------
  const visCache = new Map();
  const visible = (el) => {
    if (visCache.has(el)) return visCache.get(el);
    let ok = true;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5 || r.right <= 0 || r.bottom <= 0 || r.left >= VW || r.top >= VH) ok = false;
    if (ok) {
      const s = cs(el);
      if (s.visibility === 'hidden' || s.display === 'none') ok = false;
    }
    if (ok) {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        o *= Number(cs(e).opacity);
        if (e.hasAttribute('inert')) o = 0;
        if (o < 0.1) break;
      }
      if (o < 0.1) ok = false;
    }
    if (ok) {
      // Clipped away by a scrolling or clipping ancestor.
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const s = cs(e);
        if (s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const a = e.getBoundingClientRect();
        if (r.bottom <= a.top + 0.5 || r.top >= a.bottom - 0.5 || r.right <= a.left + 0.5 || r.left >= a.right - 0.5) {
          ok = false;
          break;
        }
      }
    }
    visCache.set(el, ok);
    return ok;
  };
  const decorative = (el) => el.matches('.lg-halo, .lg-glow, .lg-lens, .lg-lens-face, .lg-lens-copy, .lg-tip, [data-audit-overlay]') || (el.getAttribute('aria-hidden') === 'true' && el.tagName !== 'svg' && !el.querySelector('svg'));

  // ---- colours --------------------------------------------------------
  const parseColor = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const alphaOf = (c) => parseColor(c)?.[3] ?? 0;

  // ---- shapes and ink ----------------------------------------------------
  const radiusOf = (el) => {
    const r = el.getBoundingClientRect();
    let v = parseFloat(cs(el).borderTopLeftRadius) || 0;
    if (el.classList.contains('lg')) {
      const raw = cs(el).getPropertyValue('--lg-radius').trim();
      v = parseFloat(raw) || v;
    }
    return Math.min(v, r.height / 2, r.width / 2);
  };
  const ownShape = (el) => {
    if (el.classList.contains('lg')) return true;
    if (el.tagName === 'svg' || el.closest('svg')) return false;
    const s = cs(el);
    if (alphaOf(s.backgroundColor) > 0.04 || (s.backgroundImage && s.backgroundImage !== 'none' && !/url\(/.test(s.backgroundImage) && el.getBoundingClientRect().width > 12)) return true;
    const bw = ['Top', 'Right', 'Bottom', 'Left'].filter((k) => parseFloat(s[`border${k}Width`]) > 0 && alphaOf(s[`border${k}Color`]) > 0.04).length;
    if (bw === 4) return true;
    if (s.boxShadow && s.boxShadow !== 'none' && /inset/.test(s.boxShadow)) return true;
    return false;
  };
  const isRound = (el) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.width - r.height) <= 1 && radiusOf(el) >= r.height / 2 - 0.6;
  };
  const textNodeRects = (node) => {
    const rg = document.createRange();
    rg.selectNodeContents(node);
    return [...rg.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
  };
  const mirror = (() => {
    let m = null;
    return (el, text) => {
      if (!m) {
        m = document.createElement('div');
        m.setAttribute('data-audit-overlay', '');
        m.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(m);
      }
      const s = cs(el);
      const padL = parseFloat(s.paddingLeft), padR = parseFloat(s.paddingRight);
      const bl = parseFloat(s.borderLeftWidth), br = parseFloat(s.borderRightWidth);
      const w = el.getBoundingClientRect().width - padL - padR - bl - br;
      m.style.font = s.font;
      m.style.letterSpacing = s.letterSpacing;
      m.style.lineHeight = s.lineHeight;
      m.style.whiteSpace = el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
      m.style.wordBreak = s.wordBreak;
      m.style.overflowWrap = el.tagName === 'TEXTAREA' ? 'break-word' : 'normal';
      m.style.width = `${w}px`;
      m.innerHTML = '';
      const sp = document.createElement('span');
      sp.textContent = text;
      m.appendChild(sp);
      const rects = [...sp.getClientRects()];
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
      const lines = Math.max(1, Math.round(sp.getBoundingClientRect().height / lh));
      const tw = Math.max(0, ...rects.map((q) => q.width));
      return { lines, width: tw, avail: w, lh };
    };
  })();
  /** What the eye sees as the element: its own shape, else the union of its text and icons. */
  const inkCache = new Map();
  const ink = (el) => {
    if (inkCache.has(el)) return inkCache.get(el);
    let out = null;
    const r = el.getBoundingClientRect();
    const grow = (q) => {
      if (!out) out = { l: q.left, t: q.top, r: q.right, b: q.bottom };
      else out = { l: Math.min(out.l, q.left), t: Math.min(out.t, q.top), r: Math.max(out.r, q.right), b: Math.max(out.b, q.bottom) };
    };
    if (!visible(el) || decorative(el)) out = null;
    else if (ownShape(el) || ['svg', 'IMG', 'CANVAS', 'VIDEO'].includes(el.tagName)) grow(r);
    else if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range'].includes(el.type))) {
      const text = el.value || el.getAttribute('placeholder') || '';
      if (text) {
        const s = cs(el);
        const m = mirror(el, text);
        const left = r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
        const top = el.tagName === 'TEXTAREA' ? r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth) : r.top + (r.height - m.lh) / 2;
        grow({ left, top, right: left + Math.min(m.width, m.avail), bottom: top + m.lines * m.lh });
      }
    } else {
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.textContent.trim()) for (const q of textNodeRects(n)) grow(q);
        else if (n.nodeType === 1) {
          const k = ink(n);
          if (k) grow({ left: k.l, top: k.t, right: k.r, bottom: k.b });
        }
      }
    }
    inkCache.set(el, out);
    return out;
  };
  const inChrome = (el) => !!el.closest('.lg, [data-testid=title-block], [data-testid=hints]');
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('[data-audit-overlay]'));
  const vis = all.filter((el) => visible(el));
  const add = (rule, el, msg, evidence, extra = {}) => findings.push({ rule, el: desc(el), comp: comp(el), msg, evidence, rect: box(el.getBoundingClientRect()), ...extra });

  // ---- text lines -----------------------------------------------------
  const lineCount = (el) => {
    const tops = [];
    const walk = (e) => {
      for (const n of e.childNodes) {
        if (n.nodeType === 3 && n.textContent.trim()) for (const q of textNodeRects(n)) tops.push((q.top + q.bottom) / 2);
        else if (n.nodeType === 1 && visible(n) && !decorative(n) && cs(n).position !== 'absolute') walk(n);
      }
    };
    walk(el);
    tops.sort((a, b) => a - b);
    let lines = 0, last = -1e9;
    const fs = parseFloat(cs(el).fontSize) || 14;
    for (const t of tops) {
      if (t - last > fs * 0.6) lines++;
      last = t;
    }
    return lines;
  };

  // ==== rule: wrap (single-line controls never wrap) ======================
  const singleLine = vis.filter((el) => {
    if (!inChrome(el) && location.pathname !== '/') return false;
    if (el.closest('[data-testid=messages], [data-testid=turn], p, [data-audit-multiline]')) return false;
    return el.matches('button, a, label, [role^=menuitem], [role=tab], [role=radio], [role=option], [role=switch], [data-seg], .lg[data-kind=control] span, h2, h3');
  });
  for (const el of singleLine) {
    if (el.querySelector('p, br') || /pre-wrap|pre-line/.test(cs(el).whiteSpace) && !el.matches('button')) continue;
    const n = lineCount(el);
    if (n > 1) add('wrap', el, `label wraps to ${n} lines`, { lines: n, text: short((el.innerText || '').replace(/\s+/g, ' '), 40), width: R(el.getBoundingClientRect().width) });
  }
  const fields = [];
  for (const el of vis.filter((e) => e.matches('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range])'))) {
    const ph = el.getAttribute('placeholder');
    const s = cs(el);
    if (ph && !el.value) {
      const m = mirror(el, ph);
      if (el.tagName === 'TEXTAREA' && m.lines > 1) add('wrap', el, `placeholder wraps to ${m.lines} lines`, { lines: m.lines, placeholder: ph, contentWidth: R(m.avail), textWidth: R(m.width) });
      if (el.tagName === 'INPUT' && m.width > m.avail + 1) add('text-truncated', el, 'placeholder is cut off', { placeholder: ph, textWidth: R(m.width), contentWidth: R(m.avail) });
      const p = cs(el, '::placeholder');
      fields.push({ id: desc(el), comp: comp(el), sel: tid(el) ? `[data-testid="${tid(el)}"]` : null, rect: box(el.getBoundingClientRect()), placeholder: ph, phColor: p.color, color: s.color, phSize: p.fontSize, size: s.fontSize, phWeight: p.fontWeight, weight: s.fontWeight });
    }
  }

  // ==== rule: text-truncated (ellipsis or clipped overflow) =================
  for (const el of vis) {
    if (!ownText(el) || el.matches('textarea, input')) continue;
    const s = cs(el);
    const clips = s.overflow !== 'visible' || s.textOverflow === 'ellipsis';
    if (clips && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) add('text-truncated', el, 'text is cut (ellipsis or clipped)', { text: short(el.textContent.trim(), 40), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }

  // ==== rule: row-align (children of a control row on one centre line) ======
  const fontMetrics = (() => {
    const c = document.createElement('canvas').getContext('2d');
    const cache = new Map();
    return (font) => {
      if (!cache.has(font)) {
        c.font = font;
        const m = c.measureText('Hg国');
        cache.set(font, { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent });
      }
      return cache.get(font);
    };
  })();
  const baselineOf = (el) => {
    // First text node under el: its line box top plus the font's ascent.
    const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (!n.textContent.trim()) continue;
      const q = textNodeRects(n)[0];
      if (!q) continue;
      const f = fontMetrics(cs(n.parentElement).font);
      const k = q.height / (f.asc + f.desc || q.height);
      return q.top + f.asc * k;
    }
    return null;
  };
  const textOnly = (el) => !ownShape(el) && !el.querySelector('svg, img, textarea, input') && !!el.textContent.trim();
  const rowItems = (el) => [...el.children].filter((c) => visible(c) && !decorative(c) && ink(c) && cs(c).position !== 'fixed');
  const rows = [];
  for (const el of vis) {
    const s = cs(el);
    if (!/flex/.test(s.display) || !/^row/.test(s.flexDirection)) continue;
    if (!inChrome(el) && !el.closest('button, nav, header')) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 80) continue;
    const items = rowItems(el).filter((c) => cs(c).position !== 'absolute');
    if (items.length < 2) continue;
    if (s.flexWrap !== 'nowrap' && new Set(items.map((c) => Math.round(c.getBoundingClientRect().top / 8))).size > 1 && items.some((c) => ink(c).t > ink(items[0]).b)) continue;
    rows.push(el);
    const cents = items.map((c) => {
      const k = ink(c);
      return (k.t + k.b) / 2;
    });
    const spread = Math.max(...cents) - Math.min(...cents);
    if (spread <= 1.01) continue;
    // Text of mixed sizes may share a baseline instead.
    if (items.every(textOnly)) {
      const bl = items.map(baselineOf).filter((v) => v !== null);
      if (bl.length === items.length && Math.max(...bl) - Math.min(...bl) <= 1.01) continue;
    }
    const lines = [...new Set(cents.map((c) => R(c)))];
    add('row-align', el, `${items.length} children on ${lines.length} different centre lines (spread ${R(spread)} px)`, {
      spread: R(spread),
      children: items.map((c, i) => ({ el: desc(c), centreY: R(cents[i]) })),
    });
  }

  // ==== rule: inset (left = right, top = bottom inside a capsule or field) ===
  const descend = (el) => {
    // From a surface down to the row that holds its content.
    let cur = el;
    for (let i = 0; i < 6; i++) {
      const kids = [...cur.children].filter((c) => visible(c) && !decorative(c) && ink(c));
      if (kids.length !== 1) return kids.length ? kids : [cur];
      const k = kids[0];
      if (ownShape(k) && !k.matches('.lg-field')) return [k];
      cur = k;
    }
    return [cur];
  };
  const insetChecked = new Set();
  const checkInsets = (C, items, why) => {
    if (insetChecked.has(C)) return;
    insetChecked.add(C);
    const r = C.getBoundingClientRect();
    // A round button counts by its shape (shown on hover and press), even when its plate is clear at rest.
    const shapeBox = (c) => {
      const q = c.getBoundingClientRect();
      return { l: q.left, t: q.top, r: q.right, b: q.bottom };
    };
    const iks = items.map((c) => ({ c, k: c.matches('button, [role=button]') && isRound(c) ? shapeBox(c) : ink(c) })).filter((x) => x.k);
    if (!iks.length) return;
    const left = iks.reduce((a, b) => (b.k.l < a.k.l ? b : a));
    const right = iks.reduce((a, b) => (b.k.r > a.k.r ? b : a));
    const L = left.k.l - r.left, Rr = r.right - right.k.r;
    const T = Math.min(...iks.map((x) => x.k.t)) - r.top, B = r.bottom - Math.max(...iks.map((x) => x.k.b));
    const conc = (x, inset) => {
      if (!isRound(x.c)) return false;
      const d = x.c.getBoundingClientRect().height;
      return Math.abs(inset - (r.height - d) / 2) <= 1;
    };
    const lc = conc(left, L), rc = conc(right, Rr);
    let lrOk = Math.abs(L - Rr) <= 1.01;
    if (!lrOk && lc !== rc) {
      const roundSide = lc ? L : Rr, other = lc ? Rr : L;
      lrOk = other >= roundSide - 1 && other - roundSide <= 4;
    }
    const ev = { left: R(L), right: R(Rr), top: R(T), bottom: R(B), height: R(r.height), leftEnd: desc(left.c), rightEnd: desc(right.c), concentricLeft: lc, concentricRight: rc, why };
    if (!lrOk) add('inset-lr', C, `left inset ${R(L)} px, right inset ${R(Rr)} px`, ev);
    if (why !== 'header' && Math.abs(T - B) > 1.01 && r.height <= 80) add('inset-tb', C, `top inset ${R(T)} px, bottom inset ${R(B)} px`, ev);
  };
  for (const el of vis) {
    const r = el.getBoundingClientRect();
    if (el.matches('.lg[data-kind=control]') && r.height <= 80 && !el.querySelector('[data-seg]')) checkInsets(el, descend(el), 'capsule');
    else if (el.matches('.lg-field') && r.height <= 64) checkInsets(el, descend(el), 'field');
    else if (el.matches('button, [role^=menuitem], a') && ownShape(el) && !isRound(el) && ownText(el) !== null && el.textContent.trim() && r.height <= 64 && !el.matches('.lg')) {
      // Items: the element children, or (text directly inside) a range over the text.
      const kids = [...el.children].filter((c) => visible(c) && !decorative(c) && ink(c));
      if (kids.length && !ownText(el)) checkInsets(el, kids, 'button');
    }
  }
  // Panel headers: the first and last items against the surface's edges.
  for (const el of vis.filter((e) => e.matches('.lg[data-kind=text] > header, .lg[data-kind=text] > div > header, .lg [data-panel-header]'))) {
    const surf = el.closest('.lg');
    const sr = surf.getBoundingClientRect();
    const items = rowItems(el);
    if (items.length < 2) continue;
    const L = ink(items[0]).l - sr.left, Rr = sr.right - ink(items[items.length - 1]).r;
    if (Math.abs(L - Rr) > 1.01) add('inset-lr', el, `panel header: left inset ${R(L)} px, right inset ${R(Rr)} px`, { left: R(L), right: R(Rr), leftEnd: desc(items[0]), rightEnd: desc(items[items.length - 1]), why: 'header' });
  }

  // ==== rule: shape (capsules; concentric corners) ==========================
  for (const el of vis.filter((e) => e.matches('.lg[data-kind=control]'))) {
    const r = el.getBoundingClientRect();
    const raw = parseFloat(cs(el).getPropertyValue('--lg-radius')) || 0;
    if (raw < 9000 && Math.abs(raw - r.height / 2) > 1) add('capsule-radius', el, `control surface radius ${R(raw)} px, height ${R(r.height)} px (a capsule is ${R(r.height / 2)})`, { radius: R(raw), height: R(r.height) });
  }
  const shaped = vis.filter((e) => ownShape(e) && !e.matches('.lg-lens, .lg-lens-face, .lg-halo, .lg-glow, .lg-tip') && e.getBoundingClientRect().height >= 16);
  for (const S of shaped) {
    let A = S.parentElement;
    while (A && A !== document.body && !(ownShape(A) && visible(A))) A = A.parentElement;
    if (!A || A === document.body) continue;
    const a = A.getBoundingClientRect(), s = S.getBoundingClientRect();
    const RA = radiusOf(A);
    if (RA < 6) continue;
    const corners = [
      [s.left - a.left, s.top - a.top],
      [a.right - s.right, s.top - a.top],
      [s.left - a.left, a.bottom - s.bottom],
      [a.right - s.right, a.bottom - s.bottom],
    ].filter(([gx, gy]) => gx >= -0.5 && gy >= -0.5 && gx < RA && gy < RA);
    if (!corners.length) continue;
    const [gx, gy] = corners[0];
    const g = (gx + gy) / 2;
    const want = Math.max(0, RA - g), got = radiusOf(S);
    if (Math.abs(got - want) > 2.01) add('concentric', S, `corner radius ${R(got)} px inside a ${R(RA)} px corner with a ${R(g)} px gap (concentric: ${R(want)} px)`, { radius: R(got), outer: R(RA), gapX: R(gx), gapY: R(gy), expected: R(want), outerEl: desc(A) });
  }

  // ==== rule: glass-on-glass and box-in-panel ================================
  const nested = [];
  for (const el of vis.filter((e) => e.matches('.lg'))) {
    const outer = el.parentElement?.closest('.lg');
    if (outer && visible(outer)) {
      nested.push({ id: desc(el), comp: comp(el), rect: box(el.getBoundingClientRect()), outer: box(outer.getBoundingClientRect()), outerId: desc(outer), radius: R(radiusOf(el)) });
      add('glass-on-glass', el, `a glass surface inside ${desc(outer)} (card in card)`, { outer: desc(outer), backend: el.getAttribute('data-backend') });
    }
  }
  for (const el of vis) {
    if (!el.closest('.lg') || el.matches('.lg, .lg-plate, .lg-field, .lg-code, .lg-lens, .lg-lens-face, .lg-halo, .lg-glow, .lg-tip, .lg-slider *, svg, svg *, img, canvas, input, textarea')) continue;
    if (!ownShape(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) continue;
    const s = cs(el);
    const bg = parseColor(s.backgroundColor);
    if (el.matches('[data-on], [aria-checked=true], [aria-selected=true], [aria-pressed=true]')) continue;
    if (bg && bg[3] > 0.5 && Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) > 80) continue; // the accent (send, play)
    if (el.matches('button') && isRound(el)) continue;
    add('box-in-panel', el, 'a box (background, border or inset ring) inside a glass surface', { background: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopColor}`, shadow: s.boxShadow === 'none' ? '' : s.boxShadow.slice(0, 60) });
  }

  // ==== rule: hairline (separators inside glass) ==============================
  const rules = [];
  for (const el of vis) {
    const surf = el.closest('.lg');
    if (!surf || el === surf) continue;
    const s = cs(el);
    const sr = surf.getBoundingClientRect(), r = el.getBoundingClientRect();
    const sep = getComputedStyle(el).getPropertyValue('--lg-separator').trim();
    const lines = [];
    if (el.matches('.lg-sep, [role=separator], hr')) lines.push({ y: r.top + r.height / 2, w: r.height, color: s.backgroundColor, l: r.left, r: r.right });
    for (const side of ['Top', 'Bottom']) {
      const w = parseFloat(s[`border${side}Width`]);
      if (w > 0 && alphaOf(s[`border${side}Color`]) > 0.02 && !ownShape(el)) lines.push({ y: side === 'Top' ? r.top : r.bottom, w, color: s[`border${side}Color`], l: r.left, r: r.right, side });
    }
    for (const ln of lines) {
      rules.push({ id: desc(el), comp: comp(el), y: R(ln.y), l: R(ln.l), r: R(ln.r), width: ln.w, color: ln.color, surface: box(sr) });
      const inset = ln.l - sr.left >= 4 && sr.right - ln.r >= 4;
      const atEdge = Math.abs(ln.y - sr.top) < 1.5 || Math.abs(ln.y - sr.bottom) < 1.5;
      const issues = [];
      if (ln.w > 0.51) issues.push(`${R(ln.w)} px thick (the module hairline is 0.5 px)`);
      if (!inset) issues.push('runs edge to edge (hairlines are inset from both edges)');
      if (atEdge) issues.push("lies on the surface's own edge");
      if (sep && parseColor(ln.color) && parseColor(sep) && parseColor(ln.color).some((v, i) => Math.abs(v - parseColor(sep)[i]) > (i === 3 ? 0.02 : 2))) issues.push(`colour ${ln.color} is not --lg-separator ${sep}`);
      if (issues.length) add('hairline', el, `rule ${ln.side ? `(border-${ln.side.toLowerCase()}) ` : ''}${issues.join('; ')}`, { width: ln.w, color: ln.color, left: R(ln.l - sr.left), right: R(sr.right - ln.r), y: R(ln.y) });
    }
  }

  // ==== rule: field-passive-text (an input holds only its controls) ==========
  for (const f of vis.filter((e) => e.matches('textarea, input[type=text], input[type=email], input[type=search], input:not([type])'))) {
    const holder = f.closest('form') || f.closest('.lg-field') || f.closest('.lg[data-kind=control]');
    if (!holder || !holder.closest('.lg')) continue;
    const hr = holder.getBoundingClientRect();
    if (hr.height > 140) continue;
    for (const el of holder.querySelectorAll('*')) {
      if (!visible(el) || !ownText(el) || el.closest('button, a, label, [role=button], [role=status], textarea')) continue;
      let overlay = false;
      for (let e = el; e && e !== holder; e = e.parentElement) if (cs(e).position === 'absolute') overlay = true;
      if (overlay) continue; // stands in for the placeholder (status, change note)
      add('field-passive-text', el, `status text inside the input: "${short(el.textContent.trim(), 30)}"`, { text: el.textContent.trim(), field: desc(f) });
    }
  }

  // ==== rule: text-size ========================================================
  for (const el of vis) {
    if (!ownText(el) || el.closest('svg') || el.matches('textarea, input')) continue;
    if (el.closest('[data-testid=plan], [data-testid=sheets], .sheet-paper')) continue;
    const fs = parseFloat(cs(el).fontSize);
    if (fs < opts.minText - 0.01) add('text-size', el, `${R(fs)} px text (minimum ${opts.minText} px)`, { fontSize: R(fs), text: short(ownText(el), 30) });
  }

  // ==== rule: hit-target ========================================================
  const interactive = vis.filter((e) => e.matches('button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), textarea, select, [role=button], [role^=menuitem], [role=tab], [role=radio], [role=option], [role=slider], [role=switch], [role=checkbox]') && !e.closest('[aria-hidden=true]'));
  for (const el of interactive) {
    if (el.matches('input[type=range]') && el.closest('.lg-slider')) continue;
    const r = el.getBoundingClientRect();
    let w = r.width, h = r.height;
    for (const p of ['::before', '::after']) {
      const ps = cs(el, p);
      if (ps.content && ps.content !== 'none' && ps.position === 'absolute') {
        w = Math.max(w, parseFloat(ps.width) || 0);
        h = Math.max(h, parseFloat(ps.height) || 0);
      }
    }
    const need = opts.hitMin;
    if (Math.min(w, h) < need - 0.01) add('hit-target', el, `hit area ${R(w)} x ${R(h)} px (minimum ${need})`, { width: R(w), height: R(h), visible: `${R(r.width)} x ${R(r.height)}` });
  }

  // ==== rule: overlap ===========================================================
  const inkless = (el) => {
    const s = cs(el);
    return alphaOf(s.color) < 0.05 || (s.webkitTextFillColor && alphaOf(s.webkitTextFillColor) < 0.05 && /rgba/.test(s.webkitTextFillColor));
  };
  const leaves = vis.filter((el) => ownText(el) && !el.matches('textarea, input') && !el.closest('svg, [data-testid=plan], [data-testid=sheets]') && !inkless(el));
  const lrects = leaves.map((el) => ({ el, rs: [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).flatMap(textNodeRects) }));
  for (let i = 0; i < lrects.length; i++) {
    for (let j = i + 1; j < lrects.length; j++) {
      const A = lrects[i], B = lrects[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      let hit = null;
      for (const a of A.rs) for (const b of B.rs) {
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) hit = { ox: R(ox), oy: R(oy) };
      }
      if (hit) add('overlap', A.el, `text overlaps ${desc(B.el)}`, { other: desc(B.el), ...hit });
    }
  }
  for (const L of leaves) {
    const surf = L.closest('.lg');
    if (!surf) continue;
    const sr = surf.getBoundingClientRect();
    for (const n of L.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      for (const q of textNodeRects(n)) {
        const out = Math.max(sr.left - q.left, q.right - sr.right, sr.top - q.top, q.bottom - sr.bottom);
        if (out > 1) {
          add('overlap', L, `text runs ${R(out)} px outside its glass surface`, { surface: desc(surf), by: R(out) });
          break;
        }
      }
    }
  }
  const surfacesEls = vis.filter((e) => e.matches('.lg'));
  for (let i = 0; i < surfacesEls.length; i++) {
    for (let j = i + 1; j < surfacesEls.length; j++) {
      const A = surfacesEls[i], B = surfacesEls[j];
      if (A.contains(B) || B.contains(A)) continue;
      const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) add('overlap', B, `glass surface overlaps ${desc(A)} (glass over glass)`, { other: desc(A), ox: R(ox), oy: R(oy) });
    }
  }

  // ==== rule: mode-centre ==========================================================
  let modeSwitch = null;
  const ms = document.querySelector('[data-testid=mode-switch]');
  if (ms && visible(ms)) {
    const r = ms.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    modeSwitch = { cx: R(cx), screen: VW / 2 };
    if (Math.abs(cx - VW / 2) > 1.01) add('mode-centre', ms, `mode switch centre x ${R(cx)} px, screen centre ${R(VW / 2)} px (off by ${R(cx - VW / 2)})`, { centreX: R(cx), screenCentreX: VW / 2, offBy: R(cx - VW / 2) });
  }

  // ==== subject framing (3D and plan) ===============================================
  let subject = null;
  try {
    const st = window.__studio?.store?.getState?.();
    const v = window.__studio?.engine?.viewer;
    const free = (() => {
      if (!v) return null;
      const c = v.renderer.domElement.getBoundingClientRect();
      const ins = v.framedInsets;
      return { x0: c.left + ins.left, x1: c.right - ins.right, y0: c.top + ins.top, y1: c.bottom - ins.bottom };
    })();
    if (st?.mode === '3d' && v && !st.walk) {
      const c = v.renderer.domElement.getBoundingClientRect();
      const pts = v.viewPoints();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) {
        const q = p.clone().project(v.camera);
        const x = c.left + ((q.x + 1) / 2) * c.width, y = c.top + ((1 - q.y) / 2) * c.height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      subject = { mode: '3d', box: { x0: R(x0), x1: R(x1), y0: R(y0), y1: R(y1) }, free };
    } else if (st?.mode === 'plan') {
      const svg = document.querySelector('[data-testid=plan] svg');
      if (svg && visible(svg)) {
        const sr = svg.getBoundingClientRect();
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const ch of svg.children) {
          if (['title', 'defs', 'style'].includes(ch.tagName)) continue;
          const q = ch.getBoundingClientRect();
          if (q.width < 1 && q.height < 1) continue;
          if (q.width >= sr.width - 1 && q.height >= sr.height - 1) continue; // the paper
          x0 = Math.min(x0, q.left); x1 = Math.max(x1, q.right); y0 = Math.min(y0, q.top); y1 = Math.max(y1, q.bottom);
        }
        subject = { mode: 'plan', box: { x0: R(x0), x1: R(x1), y0: R(y0), y1: R(y1) }, sheet: box(sr), free };
      }
    }
    if (subject?.free) {
      const b = subject.box, f = subject.free;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, fx = (f.x0 + f.x1) / 2, fy = (f.y0 + f.y1) / 2;
      subject.centre = { x: R(cx), y: R(cy) };
      subject.freeCentre = { x: R(fx), y: R(fy) };
      const tolX = Math.max(6, 0.03 * (f.x1 - f.x0)), tolY = Math.max(6, 0.03 * (f.y1 - f.y0));
      if (Math.abs(cx - fx) > tolX || Math.abs(cy - fy) > tolY) {
        add('subject-centre', svgOr(), `${subject.mode === '3d' ? 'house' : 'plan'} centre (${R(cx)}, ${R(cy)}) is off the framing area's centre (${R(fx)}, ${R(fy)}) by (${R(cx - fx)}, ${R(cy - fy)}) px`, { centre: subject.centre, freeCentre: subject.freeCentre, box: subject.box, free: f });
      }
    }
  } catch (e) {
    subject = { error: String(e) };
  }
  function svgOr() {
    return document.querySelector('[data-testid=plan] svg') || document.querySelector('[data-testid=viewer]') || document.body;
  }

  // ==== inputs for the pixel rules and the cross-state rules ===================
  const textBoxes = [];
  for (const L of leaves) {
    if (!inChrome(L) && location.pathname !== '/') continue;
    if (L.closest('button[disabled], [aria-disabled=true]')) continue;
    const s = cs(L);
    const col = parseColor(s.color);
    if (!col) continue;
    let o = 1;
    for (let e = L; e && e.nodeType === 1; e = e.parentElement) o *= Number(cs(e).opacity);
    const rs = [...L.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).flatMap(textNodeRects).map((q) => [q.left, q.top, q.width, q.height]);
    if (!rs.length) continue;
    textBoxes.push({ id: desc(L), comp: comp(L), color: [col[0], col[1], col[2], col[3] * o], size: parseFloat(s.fontSize), weight: Number(s.fontWeight), rects: rs, text: short(ownText(L), 24) });
  }
  const surfaces = surfacesEls.map((el) => ({ id: desc(el), comp: comp(el), kind: el.getAttribute('data-kind'), backend: el.getAttribute('data-backend'), rect: box(el.getBoundingClientRect()), radius: R(radiusOf(el)) }));
  const disabled = vis.filter((e) => e.matches('button[disabled], [aria-disabled=true]')).map((el) => ({ id: desc(el), comp: comp(el), rect: box(el.getBoundingClientRect()), round: isRound(el) }));
  const enabledKeyed = vis.filter((e) => e.matches('button:not([disabled])') && tid(e)).map((el) => ({ id: desc(el), comp: comp(el), rect: box(el.getBoundingClientRect()) }));
  const selected = vis.filter((e) => e.matches('[aria-checked=true], [aria-selected=true], [aria-pressed=true], [data-on], [aria-current]:not([aria-current=false])') && !e.matches('.lg-lens')).map((el) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const lens = [...document.querySelectorAll('.lg-lens')].some((l) => {
      const q = l.getBoundingClientRect();
      return visible(l) && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
    });
    const check = !!el.querySelector('svg path[d*="l"]') && /menuitemradio|option/.test(el.getAttribute('role') || '');
    return { id: desc(el), comp: comp(el), role: el.getAttribute('role') || el.tagName.toLowerCase(), sig: { bg: s.backgroundColor, weight: s.fontWeight, color: s.color, lens, check } };
  });
  const strings = [...new Set(leaves.map((el) => ownText(el)).filter((t) => t.length >= 2 && t.length <= 40 && !/^[\d\s.,:×x·%²m°+\-–/]+$/.test(t)))];

  // Colours and radii in the chrome (for the token check).
  const colours = new Map();
  const radii = new Map();
  for (const el of vis) {
    if (!el.closest('.lg') || el.closest('svg')) continue;
    const s = cs(el);
    const props = [['color', ownText(el) ? s.color : null], ['background', s.backgroundColor], ['border', parseFloat(s.borderTopWidth) > 0 ? s.borderTopColor : null]];
    for (const [k, v] of props) {
      if (!v || alphaOf(v) === 0) continue;
      const key = `${k} ${v}`;
      if (!colours.has(key)) colours.set(key, desc(el));
    }
    if (ownShape(el) && !el.matches('.lg')) {
      const r = parseFloat(s.borderTopLeftRadius);
      const h = el.getBoundingClientRect().height;
      const key = r >= h / 2 - 0.5 ? 'capsule' : `${R(r)}`;
      if (!radii.has(key)) radii.set(key, desc(el));
    }
  }

  // ==== guides for the contact sheet ===========================================
  const comps = [];
  const seen = new Set();
  for (const el of vis.filter((e) => e.matches('.lg') || e.matches('[data-testid=title-block], [data-testid=hints]'))) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const name = comp(el) + (el.matches('.lg') ? '' : '');
    let key = name, n = 2;
    while (seen.has(key)) key = `${name}-${n++}`;
    seen.add(key);
    const kids = el.matches('.lg[data-kind=control]') ? descend(el) : [];
    const k = kids.length ? kids.map(ink).filter(Boolean) : [];
    const guides = { box: box(r), centreY: R(r.top + r.height / 2), centreX: R(r.left + r.width / 2) };
    if (k.length) {
      guides.inkL = R(Math.min(...k.map((q) => q.l)));
      guides.inkR = R(Math.max(...k.map((q) => q.r)));
      guides.childCentres = k.map((q) => R((q.t + q.b) / 2));
    }
    comps.push({ key, name, kind: el.getAttribute('data-kind') || 'plain', guides });
  }
  const findingGuides = findings.map((f) => f.rect);

  return { findings, comps, findingGuides, textBoxes, surfaces, nested, fields, disabled, enabledKeyed, selected, strings, subject, modeSwitch, rules, colours: [...colours.entries()], radii: [...radii.entries()], vw: VW, vh: VH };
}

/**
 * Pixel rules, in a blank analysis page. `job`: { normal, bare (base64 PNGs
 * at CSS scale), textBoxes, nested, surfaces, disabled, enabledKeyed, accent }.
 */
export async function analysePixels(job) {
  const load = async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return { W: img.width, H: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
  };
  const normal = await load(job.normal), bare = await load(job.bare);
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const Lrel = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const px = (im, x, y) => {
    x = Math.max(0, Math.min(im.W - 1, Math.round(x)));
    y = Math.max(0, Math.min(im.H - 1, Math.round(y)));
    const i = (y * im.W + x) * 4;
    return [im.d[i], im.d[i + 1], im.d[i + 2]];
  };
  const R = (v) => Math.round(v * 100) / 100;
  const out = { contrast: [], fills: [], rules: [], accent: [], means: [], enabledMeans: [] };

  // Contrast: text colour over the worst pixel of the glass behind it (text hidden).
  for (const b of job.textBoxes) {
    const [ir, ig, ib, ia] = b.color;
    const lightInk = Lrel(ir, ig, ib) > 0.4;
    let worst = null;
    for (const [x, y, w, h] of b.rects) {
      for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) {
        const p = px(bare, xx, yy);
        const l = Lrel(...p);
        if (!worst || (lightInk ? l > worst.l : l < worst.l)) worst = { l, rgb: p };
      }
    }
    if (!worst) continue;
    const mix = [0, 1, 2].map((j) => b.color[j] * ia + worst.rgb[j] * (1 - ia));
    const li = Lrel(...mix);
    const ratio = (Math.max(li, worst.l) + 0.05) / (Math.min(li, worst.l) + 0.05);
    out.contrast.push({ id: b.id, comp: b.comp, ratio: R(ratio), bg: worst.rgb, size: b.size, weight: b.weight, text: b.text, rect: b.rects[0] });
  }

  // Fills: a nested surface against the surface around it (text hidden).
  const band = (im, x0, y0, x1, y1) => {
    let s = 0, n = 0;
    for (let y = Math.round(y0); y <= y1; y++) for (let x = Math.round(x0); x <= x1; x++) {
      s += luma(...px(im, x, y));
      n++;
    }
    return n ? s / n : null;
  };
  for (const s of job.nested) {
    const r = s.rect;
    const inner = band(bare, r.x + r.w * 0.3, r.y + 4, r.x + r.w * 0.7, r.y + 9);
    const innerSide = band(bare, r.x + 4, r.y + r.h * 0.35, r.x + 9, r.y + r.h * 0.65);
    const outer = band(bare, r.x + r.w * 0.3, r.y - 9, r.x + r.w * 0.7, r.y - 4);
    const outerSide = band(bare, r.x - 9, r.y + r.h * 0.35, r.x - 4, r.y + r.h * 0.65);
    out.fills.push({ id: s.id, comp: s.comp, inner: R((inner + innerSide) / 2), outer: R((outer + outerSide) / 2), delta: R((inner + innerSide) / 2 - (outer + outerSide) / 2) });
  }

  // Rules: horizontal lines brighter than the glass above and below them.
  for (const s of job.surfaces) {
    if (s.rect.w < 120 || s.rect.h < 60) continue;
    const x0 = Math.round(s.rect.x + s.rect.w * 0.15), x1 = Math.round(s.rect.x + s.rect.w * 0.85);
    const rowL = [];
    for (let y = Math.round(s.rect.y) - 2; y <= s.rect.y + s.rect.h + 2; y++) {
      let t = 0;
      for (let x = x0; x <= x1; x += 2) t += luma(...px(bare, x, y));
      rowL.push([y, t / Math.ceil((x1 - x0 + 1) / 2)]);
    }
    const at = new Map(rowL);
    const found = [];
    for (const [y, l] of rowL) {
      if (y < s.rect.y + 3 || y > s.rect.y + s.rect.h - 3) continue;
      const up = at.get(y - 3), dn = at.get(y + 3);
      if (up === undefined || dn === undefined) continue;
      if (l < Math.max(up, dn) + 2) continue; // a peak, not a step
      const d = l - (up + dn) / 2;
      if (d < 4) continue;
      let cover = 0, n = 0;
      for (let x = x0; x <= x1; x += 2) {
        const c = luma(...px(bare, x, y));
        if (c > Math.max(luma(...px(bare, x, y - 3)), luma(...px(bare, x, y + 3))) + 2) cover++;
        n++;
      }
      if (cover / n < 0.6) continue;
      const prev = found[found.length - 1];
      if (prev && y - prev.y <= 2) {
        if (d > prev.delta) Object.assign(prev, { y, delta: R(d), level: R(l) });
      } else found.push({ y, delta: R(d), level: R(l), cover: R(cover / n) });
    }
    for (const f of found) out.rules.push({ surface: s.id, comp: s.comp, backend: s.backend, ...f, span: [x0, x1] });
  }

  // Accent share and mean colour of disabled controls; mean colour of enabled ones.
  const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 60;
  const stats = (r) => {
    let n = 0, acc = 0;
    const m = [0, 0, 0];
    for (let y = Math.round(r.y); y < r.y + r.h; y++) for (let x = Math.round(r.x); x < r.x + r.w; x++) {
      const p = px(normal, x, y);
      n++;
      if (job.accent && near(p, job.accent)) acc++;
      m[0] += p[0]; m[1] += p[1]; m[2] += p[2];
    }
    return { share: n ? acc / n : 0, mean: m.map((v) => Math.round(v / Math.max(1, n))) };
  };
  for (const d of job.disabled) {
    const s = stats(d.rect);
    out.accent.push({ id: d.id, comp: d.comp, share: R(s.share), mean: s.mean, rect: d.rect });
  }
  for (const d of job.enabledKeyed) {
    const s = stats(d.rect);
    out.enabledMeans.push({ id: d.id, comp: d.comp, mean: s.mean, share: R(s.share) });
  }
  return out;
}

/** Ink strength of text in a box: how far the brightest (or darkest) glyph pixels stand from the background. */
export async function inkStrength(job) {
  const img = new Image();
  img.src = `data:image/png;base64,${job.png}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const ls = [];
  for (let i = 0; i < d.length; i += 4) ls.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const sorted = [...ls].sort((a, b) => a - b);
  const bg = sorted[Math.floor(sorted.length / 2)];
  const dev = ls.map((l) => Math.abs(l - bg)).sort((a, b) => a - b);
  const p98 = dev[Math.floor(dev.length * 0.98)];
  const p995 = dev[Math.floor(dev.length * 0.995)];
  return { bg: Math.round(bg), p98: Math.round(p98 * 10) / 10, p995: Math.round(p995 * 10) / 10 };
}
