export function DeviceFrame() {
  return (
    <div
      role="img"
      aria-label="A phone showing the shared preview at the public URL."
      className="mx-auto w-full max-w-[15rem] rounded-[2rem] border border-line bg-bg p-2 shadow-xl"
    >
      <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="truncate font-mono text-[0.625rem] text-ink-2">
          quiet-harbor-4f2.peek.run
        </span>
      </div>
      <div className="mt-2 space-y-2 rounded-2xl bg-surface p-3">
        <div className="h-3 w-2/3 rounded bg-line" />
        <div className="h-2 w-full rounded bg-line/70" />
        <div className="h-2 w-5/6 rounded bg-line/70" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg bg-line/60" />
          <div className="h-12 rounded-lg bg-line/60" />
        </div>
        <div className="h-2 w-1/2 rounded bg-accent/40" />
      </div>
    </div>
  )
}
