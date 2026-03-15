import { Badge } from '~/components/ui/badge'

type SandboxStatus = 'creating' | 'ready' | 'failed'

const statusConfig: Record<SandboxStatus, { label: string; className: string }> = {
  creating: {
    label: 'CREATING',
    className: 'border-2 border-foreground bg-accent text-foreground',
  },
  ready: {
    label: 'READY',
    className: 'border-2 border-foreground bg-foreground text-background',
  },
  failed: {
    label: 'FAILED',
    className: 'border-2 border-foreground bg-destructive text-white',
  },
}

export function StatusPill({ status }: { status: SandboxStatus }) {
  const config = statusConfig[status]

  return (
    <Badge variant="outline" className={`font-black uppercase tracking-widest ${config.className}`}>
      {config.label}
    </Badge>
  )
}
