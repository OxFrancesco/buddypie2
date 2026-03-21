const STORAGE_KEY = 'buddypie:kickoff-prompt-ack-until-ms'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function isKickoffPromptAckValid(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return false

    const until = Number.parseInt(raw, 10)
    if (!Number.isFinite(until)) return false

    return Date.now() < until
  } catch {
    return false
  }
}

export function setKickoffPromptAckForOneDay(): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      String(Date.now() + ONE_DAY_MS),
    )
  } catch {
    // ignore (SSR, private mode, or missing storage)
  }
}
