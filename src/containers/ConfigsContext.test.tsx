import { act, render, waitFor } from '@testing-library/react'
import React from 'react'
import { ConfigsContextWrapper, useConfigs } from './ConfigsContext'

// Mock the storage-backed helper so the test runs in jsdom without `browser`.
const setSpy = jest.fn()
const baseConfig = { sidebarToggleMode: 'float', toggleButtonVerticalDistance: 64 }
jest.mock('utils/config/helper', () => ({
  configHelper: {
    get: () => Promise.resolve({ ...baseConfig }),
    set: (config: unknown) => setSpy(config),
  },
}))

// Regression: a delayed config writer (e.g. ToggleShowButton's debounced
// toggleButtonVerticalDistance save) fires with an onChange captured from an
// earlier render. It must NOT clobber a key changed in between by writing a
// whole config built off the stale snapshot — that reverted persistent dock
// mode back to float across a reload.
test('a stale delayed onChange does not revert a key changed in between', async () => {
  let firstOnChange: ((u: Record<string, unknown>) => void) | undefined
  function Capture() {
    const { onChange } = useConfigs()
    // Capture only the first render's onChange, mimicking a closure held by a
    // debounced callback scheduled before later config changes happened.
    if (!firstOnChange) firstOnChange = onChange as never
    return null
  }

  render(
    <ConfigsContextWrapper>
      <Capture />
    </ConfigsContextWrapper>,
  )
  await waitFor(() => expect(firstOnChange).toBeDefined())

  // A change persists persistent mode.
  act(() => firstOnChange!({ sidebarToggleMode: 'persistent' }))
  // The stale, earlier-captured writer fires afterwards with an unrelated key.
  act(() => firstOnChange!({ toggleButtonVerticalDistance: 99 }))

  const lastWrite = setSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>
  expect(lastWrite.toggleButtonVerticalDistance).toBe(99)
  expect(lastWrite.sidebarToggleMode).toBe('persistent')
})
