import { Gitako } from 'components/Gitako'
import { IN_PRODUCTION_MODE } from 'env'
import React, { useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { insertMountPoint, insertSideBarMountPoint } from 'utils/DOMHelper'
import { useAfterRedirect } from 'utils/hooks/useFastRedirect'
import { waitForNext } from 'utils/waitForNextEvent'
import './content.scss'

const renderReact = () => {
  const mountPoint = insertSideBarMountPoint()
  const MountPointWatcher = () => {
    useAfterRedirect(useCallback(() => insertMountPoint(() => mountPoint), []))
    return null
  }
  const root = createRoot(mountPoint)
  root.render(
    <>
      <MountPointWatcher />
      <Gitako />
    </>,
  )

  return () => {
    root.unmount()
  }
}

// injects a copy of stylesheets so that other extensions(e.g. dark reader) could read
// resolves when style is loaded to prevent render without proper styles
const injectStyles = (url: string) =>
  new Promise<() => void>(resolve => {
    const linkElement = document.createElement('link')
    linkElement.setAttribute('rel', 'stylesheet')
    linkElement.setAttribute('href', url)
    const unload = () => {
      linkElement.remove()
    }
    linkElement.onload = () => resolve(unload)
    document.head.appendChild(linkElement)
  })

const GitakoExclusiveEventType = 'GITAKO_EXCLUSIVE_EVENT'
const GitakoMountedEventType = 'GITAKO_MOUNTED_EVENT'

Promise.resolve()
  .then(() =>
    document.readyState === 'loading' ? waitForNext.documentEvent('DOMContentLoaded') : null,
  )
  .then(() =>
    Promise.all([injectStyles(browser.runtime.getURL('content.css')), renderReact()]).then(
      ([unmountStyles, unmountReact]) =>
        () =>
          Promise.all([unmountStyles(), unmountReact()]),
    ),
  )
  .then(unmount => {
    document.dispatchEvent(new CustomEvent(GitakoMountedEventType))
    if (IN_PRODUCTION_MODE) {
      waitForNext.documentEvent(GitakoExclusiveEventType).then(unmount)
    } else {
      waitForNext
        .documentEvent(GitakoMountedEventType)
        .then(() => document.dispatchEvent(new CustomEvent(GitakoExclusiveEventType)))
    }
  })
