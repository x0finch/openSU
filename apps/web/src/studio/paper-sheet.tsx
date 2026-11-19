// The drawing sheet's own pictures (moved out of the base in task 031: the
// placeholder draws this product's sheet layout, a hero block and a plan).
/** A sheet shown large (the viewer): the picture, or paper of its shape while it renders. */
export function PaperSheetImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) return <img key={src} src={src} alt={alt} className="max-h-full max-w-full animate-[fade-in_200ms_ease-out] rounded-[4px] bg-white object-contain shadow-[0_2px_6px_rgba(0,0,0,0.06),0_24px_60px_rgba(0,0,0,0.12)]" draggable={false} />;
  return (
    <div className="relative aspect-[3/4] h-full max-h-full rounded-[4px] bg-white">
      <SheetPlaceholder />
    </div>
  );
}

/** Placeholder in the shape of a sheet: a hero block, a hairline, a plan block, a progress sweep. */
export function SheetPlaceholder() {
  return (
    <span className="absolute inset-0 flex flex-col p-[9%]" aria-hidden="true">
      <span className="h-[4%] w-[28%] rounded-[2px] bg-wash" />
      <span className="mx-auto mt-[6%] h-[30%] w-[62%] rounded-[3px] bg-wash" />
      <span className="mt-[7%] h-px w-full bg-hairline" />
      <span className="mx-auto mt-[8%] h-[34%] w-[66%] rounded-[3px] bg-wash" />
      <span className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-hairline">
        <span className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink" />
      </span>
    </span>
  );
}
