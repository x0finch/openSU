// One short message above the input that leaves by itself (task 027; the
// sign-in confirmation of task 026 uses the same place). The latest wins.
import { create } from 'zustand';

interface ToastState {
  text: string;
  /** The message's test id (e2e). */
  testId: string;
  /** Bumped for every message (also the same text twice). */
  seq: number;
}

export const useToast = create<ToastState>(() => ({ text: '', testId: '', seq: 0 }));

export function toast(text: string, testId = 'toast'): void {
  useToast.setState((s) => ({ text, testId, seq: s.seq + 1 }));
}
