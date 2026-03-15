type SandboxStatus = 'creating' | 'ready' | 'failed'

const statusStyles: Record<SandboxStatus, string> = {
  creating:
    'border-amber-400/30 bg-amber-500/10 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
  ready:
    'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]',
  failed:
    'border-rose-400/30 bg-rose-500/10 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.08)]',
}

export function StatusPill({ status }: { status: SandboxStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}
