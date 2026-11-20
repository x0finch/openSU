// Images in the conversation (task 038): attached to a message (button,
// paste, drop), numbered 图1, 图2... per conversation and referred to later
// as "@图N". The browser shrinks each one (JPEG, long side LONG_SIDE px)
// before anything else sees it (image-data.ts, loaded on first use), keeps it in IndexedDB on this device only
// (the owner's choice: no server storage; a conversation opened elsewhere
// shows that an image stayed on its device) and sends it inline with the
// message that attaches or mentions it.

/** An image of a user message: its id in this browser's store and its number in the conversation. */
export interface ChatImage {
  id: string;
  /** 图N: numbered in the conversation in the order the images were sent. */
  n: number;
  w: number;
  h: number;
}

/** An image ready to send, not yet numbered (the compose field's attachments). */
export interface PendingImage {
  id: string;
  dataUrl: string;
  w: number;
  h: number;
}

/** At most this many images per message. */
export const MAX_IMAGES = 4;

/** "@图3" in a message: the numbers it mentions, in order, once each. */
export function mentionedImages(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/@图(\d+)/g)) {
    const n = Number(m[1]);
    if (n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** This browser's image store, loaded with the first image (image-data.ts). */
export const imageData = () => import('./image-data');
