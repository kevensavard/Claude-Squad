import { describe, it, expect } from 'vitest'

// Test the dependency gate logic in isolation using the same closure pattern as connect.ts

function makeDepGate() {
  const taskStatus = new Map<string, string>()
  const taskDoneListeners = new Map<string, Array<() => void>>()

  function onTaskUpdate(id: string, status: string) {
    taskStatus.set(id, status)
    if (status === 'done' || status === 'aborted') {
      const listeners = taskDoneListeners.get(id) ?? []
      for (const cb of listeners) cb()
      taskDoneListeners.delete(id)
    }
  }

  function waitForDependencies(depIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const pending = new Set(depIds.filter(id => taskStatus.get(id) !== 'done' && taskStatus.get(id) !== 'aborted'))
      if (pending.size === 0) { resolve(); return }
      for (const id of [...pending]) {
        const listeners = taskDoneListeners.get(id) ?? []
        listeners.push(() => {
          pending.delete(id)
          if (pending.size === 0) resolve()
        })
        taskDoneListeners.set(id, listeners)
      }
    })
  }

  return { onTaskUpdate, waitForDependencies, taskStatus }
}

describe('waitForDependencies', () => {
  it('resolves immediately when depIds is empty', async () => {
    const { waitForDependencies } = makeDepGate()
    await expect(waitForDependencies([])).resolves.toBeUndefined()
  })

  it('resolves immediately when all deps already done', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    onTaskUpdate('task-1', 'done')
    await expect(waitForDependencies(['task-1'])).resolves.toBeUndefined()
  })

  it('waits until dep transitions to done', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1'])
    let resolved = false
    p.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)
    onTaskUpdate('task-1', 'done')
    await p
    expect(resolved).toBe(true)
  })

  it('waits for all deps when multiple', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1', 'task-2'])
    onTaskUpdate('task-1', 'done')
    await Promise.resolve()
    onTaskUpdate('task-2', 'done')
    await p
  })

  it('resolves on aborted dep too (caller checks status)', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1'])
    onTaskUpdate('task-1', 'aborted')
    await p
  })
})
