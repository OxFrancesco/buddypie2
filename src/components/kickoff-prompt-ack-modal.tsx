import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { setKickoffPromptAckForOneDay } from '~/lib/kickoff-prompt-ack'

type KickoffPromptAckModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcknowledged: () => void
}

export function KickoffPromptAckModal({
  open,
  onOpenChange,
  onAcknowledged,
}: KickoffPromptAckModalProps) {
  const [checked, setChecked] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) setChecked(false)
    onOpenChange(next)
  }

  function handleContinue() {
    if (!checked) return
    setKickoffPromptAckForOneDay()
    handleOpenChange(false)
    onAcknowledged()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase">
            You are overwriting our system prompt
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="font-bold text-foreground">
                Each preset includes a default <strong>system prompt</strong>{' '}
                (opening instructions) that tells the agent how to start in your
                repo.
              </p>
              <p className="text-muted-foreground">
                Anything you type in <strong>Kickoff Prompt</strong> replaces
                that default for this launch. The preset&apos;s ongoing
                behavior and tooling stay the same; your text becomes the
                starting system prompt instead of ours.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-foreground bg-muted/30 p-3 shadow-[2px_2px_0_var(--foreground)]">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-2 border-foreground accent-foreground"
          />
          <span className="text-sm leading-snug">
            I understand I am overwriting BuddyPie&apos;s default system prompt
            for this field. Don&apos;t show this reminder again for 24 hours.
          </span>
        </label>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-2 border-foreground font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleContinue}
            disabled={!checked}
            className="border-2 border-foreground bg-foreground font-black uppercase text-background shadow-[2px_2px_0_var(--accent)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
          >
            Continue to kickoff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
