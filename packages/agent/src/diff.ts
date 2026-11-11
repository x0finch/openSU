// The changed lines between two `describeHouse` texts, grouped by section
// (LEVEL header, ROOFS, ...). Tool results carry only this, not the whole
// description: the model got the full text once at the start of the turn.

const LEGEND = /^(Units mm|Space rows|Opening rows)/;

interface Section {
  header: string;
  lines: string[];
}

function sections(text: string): Section[] {
  const out: Section[] = [{ header: '', lines: [] }];
  for (const line of text.split('\n')) {
    if (!line.trim() || LEGEND.test(line)) continue;
    if (/^(LEVEL |ROOFS|ISSUES)/.test(line)) {
      // Header lines are compared like content lines too.
      out.push({ header: line.startsWith('LEVEL ') ? line.split(' ').slice(0, 2).join(' ') : line.split(' ')[0]!, lines: [line] });
      continue;
    }
    if (line === 'spaces:' || line === 'openings:') continue;
    out[out.length - 1]!.lines.push(line);
  }
  return out;
}

/** Multiset difference a - b. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const count = new Map<string, number>();
  for (const l of b) count.set(l, (count.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of a) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

/**
 * Changed lines of `after` against `before`: per section, `+ line` for new or
 * changed lines and `- line` for lines that are gone. At most `maxLines`
 * lines; the rest is summarised.
 */
export function describeDiff(before: string, after: string, maxLines = 60): string {
  const a = sections(before);
  const b = sections(after);
  const key = (s: Section) => s.header;
  const headers = [...new Set([...a.map(key), ...b.map(key)])];
  const out: string[] = [];
  let total = 0;
  for (const h of headers) {
    const sa = a.find((s) => s.header === h)?.lines ?? [];
    const sb = b.find((s) => s.header === h)?.lines ?? [];
    const removed = minus(sa, sb);
    const added = minus(sb, sa);
    if (!removed.length && !added.length) continue;
    const lines = [...removed.map((l) => `- ${l}`), ...added.map((l) => `+ ${l}`)];
    total += lines.length;
    out.push(h ? `[${h}]` : '[SITE/GRID]', ...lines);
  }
  if (!out.length) return 'no change';
  if (total <= maxLines) return out.join('\n');
  const kept: string[] = [];
  let n = 0;
  for (const l of out) {
    if (!l.startsWith('[') && ++n > maxLines) break;
    kept.push(l);
  }
  return `${kept.join('\n')}\n(${total - maxLines} more changed lines; call get_house for the full description)`;
}
