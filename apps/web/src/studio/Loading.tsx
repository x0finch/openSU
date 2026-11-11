/** Quiet loading state: a label over a thin sweeping hairline. */
export function Loading({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
      <div className="flex w-40 flex-col items-center gap-3">
        <div className="relative h-px w-full overflow-hidden bg-hairline">
          <div className="absolute inset-y-0 left-0 w-2/5 bg-ink animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite]" />
        </div>
        <p className="text-xs text-ink-2">{label}</p>
      </div>
    </div>
  );
}
