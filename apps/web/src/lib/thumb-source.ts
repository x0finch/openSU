// Where a project's thumbnail comes from (task 027): the studio's own 3D
// viewer while it exists (Viewer3D registers it), drawn once into an
// offscreen target. No second WebGL context and no shader compile. A
// session that never shows 3D (plan or sheets only) has no source: the
// picture waits until 3D is shown, or a later session.
let source: ((width: number, height: number) => Promise<Blob | null>) | null = null;

export const THUMB_W = 480;
export const THUMB_H = 360;

export const thumbSource = {
  set(fn: typeof source): void {
    source = fn;
  },
  /** The picture, or null (no 3D viewer, or the scene is not the plain house right now). */
  capture(): Promise<Blob | null> {
    return source ? source(THUMB_W, THUMB_H) : Promise.resolve(null);
  },
};
