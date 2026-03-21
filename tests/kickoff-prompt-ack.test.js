import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isKickoffPromptAckValid,
  setKickoffPromptAckForOneDay,
} from '../src/lib/kickoff-prompt-ack.ts'

function attachMemoryLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    },
  }
}

describe('kickoff-prompt-ack', () => {
  const originalNow = Date.now

  beforeEach(() => {
    attachMemoryLocalStorage()
    Date.now = originalNow
  })

  afterEach(() => {
    Date.now = originalNow
  })

  test('is invalid when storage is empty', () => {
    expect(isKickoffPromptAckValid()).toBe(false)
  })

  test('is valid immediately after setting', () => {
    setKickoffPromptAckForOneDay()
    expect(isKickoffPromptAckValid()).toBe(true)
  })

  test('expires after one day', () => {
    const t0 = 1_700_000_000_000
    Date.now = () => t0
    setKickoffPromptAckForOneDay()

    const dayMs = 24 * 60 * 60 * 1000
    Date.now = () => t0 + dayMs - 1
    expect(isKickoffPromptAckValid()).toBe(true)

    Date.now = () => t0 + dayMs + 1
    expect(isKickoffPromptAckValid()).toBe(false)
  })
})
