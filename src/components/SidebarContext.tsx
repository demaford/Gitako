import React from 'react'
import { noop } from 'utils/general'
import { FocusTarget } from './FocusTarget'

// Set true by the file tree's keydown handler right before a
// keyboard-initiated page navigation (Enter / ArrowRight on a file), cleared
// when the user next touches the mouse. The sidebar reads it to keep itself
// expanded and pull focus back into the tree, so the user can keep arrowing
// instead of having the bar auto-collapse out from under them. Mouse-driven
// opens leave it false and collapse as usual.
//
// It's a module-level singleton, not a `useRef` inside SideBar, on purpose:
// cross-context navigations (e.g. issue -> blob, where the resolved branch
// changes) change the committed repo meta, which makes RepoContextWrapper
// briefly hit its `disabled` state and unmount SideBar. A ref scoped to SideBar
// would reset to false on the remount, dropping the keyboard-nav intent exactly
// when the rebuilt sidebar needs it to decide its initial expand/focus state. A
// module singleton survives the remount.
export const keyboardNavRef: React.MutableRefObject<boolean> = { current: false }

// Use this to pass state across components under Sidebar
export const SidebarContext = React.createContext<{
  pendingFocusTarget: IO<FocusTarget>
  keyboardNavRef: React.MutableRefObject<boolean>
}>({
  pendingFocusTarget: { onChange: noop, value: null },
  keyboardNavRef,
})
