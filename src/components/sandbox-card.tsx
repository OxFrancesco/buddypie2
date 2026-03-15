import { Link } from '@tanstack/react-router'
import { StatusPill } from '~/components/status-pill'

type SandboxCardProps = {
  sandbox: {
    _id: string
    repoName: string
    repoUrl: string
    repoBranch?: string
    repoProvider: 'github' | 'git'
    status: 'creating' | 'ready' | 'failed'
    previewUrl?: string
    errorMessage?: string
    workspacePath?: string
  }
  isBusy?: boolean
  onDelete: () => void
  onRestart: () => void
}

export function SandboxCard({
  sandbox,
  isBusy,
  onDelete,
  onRestart,
}: SandboxCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(5,8,20,0.42)] backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={sandbox.status} />
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-white/55">
              {sandbox.repoProvider}
            </span>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white">
              {sandbox.repoName}
            </h3>
            <p className="mt-1 break-all text-sm text-white/55">
              {sandbox.repoUrl}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRestart}
            disabled={isBusy}
            className="rounded-full border border-white/12 px-3.5 py-2 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            className="rounded-full border border-rose-400/25 px-3.5 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-white/65 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Branch
          </p>
          <p className="mt-2 font-medium text-white/85">
            {sandbox.repoBranch || 'default'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Workspace
          </p>
          <p className="mt-2 break-all font-medium text-white/85">
            {sandbox.workspacePath || 'Provisioning workspace...'}
          </p>
        </div>
      </div>

      {sandbox.errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100">
          {sandbox.errorMessage}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/sandboxes/$sandboxId"
          params={{ sandboxId: sandbox._id }}
          className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
        >
          Open workspace
        </Link>

        {sandbox.previewUrl ? (
          <a
            href={sandbox.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/6"
          >
            Open preview
          </a>
        ) : (
          <span className="text-sm text-white/45">
            OpenCode preview appears here once the sandbox is ready.
          </span>
        )}
      </div>
    </article>
  )
}
