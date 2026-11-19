// Badge: a small label on a wash ("已撤销").
import type { ReactNode } from 'react';

export function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-[5px] bg-wash px-1.5 py-px text-2xs font-normal text-ink-2">{children}</span>;
}
