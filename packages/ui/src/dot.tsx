// Dot: a small round mark (an unseen reply, a hint, a status). `accent`: ginkgo yellow; `muted`: the third ink.
import { cx } from './surface';

export function Dot({ tone = 'accent', size = 6, className }: { tone?: 'accent' | 'muted' | 'ink'; size?: number; className?: string }) {
  return <span className={cx('inline-block shrink-0 rounded-full', tone === 'accent' ? 'bg-accent' : tone === 'ink' ? 'bg-ink' : 'bg-ink-3', className)} style={{ width: size, height: size }} aria-hidden="true" />;
}
