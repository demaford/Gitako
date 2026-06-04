import { SyncIcon } from '@primer/octicons-react'
import iconURL from 'assets/icons/Gitako.png'
import { useConfigs } from 'containers/ConfigsContext'
import { SideBarErrorContext } from 'containers/ErrorContext'
import { ReloadContext } from 'containers/ReloadContext'
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDebounce, useWindowSize } from 'react-use'
import { cx } from 'utils/cx'
import { useLoadedContext } from 'utils/hooks/useLoadedContext'
import { useResizeHandler } from 'utils/hooks/useResizeHandler'
import { RoundIconButton } from './RoundIconButton'

type Props = {
  className?: React.HTMLAttributes<HTMLButtonElement>['className']
  onHover?: React.HTMLAttributes<HTMLButtonElement>['onMouseEnter']
  onClick?: (e: PointerEvent) => void
  children?: React.ReactNode
}

const buttonHeight = 42

function getSafeDistance(y: number, height: number) {
  return Math.max(0, Math.min(y, height - buttonHeight))
}

export function ToggleShowButton({ className, onClick, onHover, children }: Props) {
  const reload = useContext(ReloadContext)
  const error = useLoadedContext(SideBarErrorContext).value

  const ref = useRef<HTMLDivElement>(null)
  const config = useConfigs()
  const [distance, setDistance] = useState(config.value.toggleButtonVerticalDistance)
  const { height } = useWindowSize()
  useEffect(() => {
    // make sure it is inside viewport
    const safeDistance = getSafeDistance(distance, height)
    if (safeDistance !== distance) setDistance(safeDistance)
  }, [height, distance])

  // updating context
  useDebounce(
    () => config.onChange({ toggleButtonVerticalDistance: distance }), // too slow
    100,
    [distance],
  )

  // reposition on window height change, but ignores distance change
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.top = distance + 'px'
    }
  }, [height]) // eslint-disable-line react-hooks/exhaustive-deps

  // And this repositions on drag
  const { onPointerDown } = useResizeHandler(
    [distance, distance],
    ([, y]) => {
      const distance = getSafeDistance(y, height)
      setDistance(distance)
      if (ref.current) {
        ref.current.style.top = distance + 'px'
      }
    },
    { onClick },
  )

  const placement = config.value.sidebarPlacement

  return (
    <div
      ref={ref}
      className={cx('gitako-toggle-show-button-wrapper', `placement-${placement}`, className)}
    >
      <button
        className={cx('gitako-toggle-show-button', {
          error,
        })}
        onPointerEnter={onHover}
        onPointerDown={onPointerDown}
        title={'Gitako (draggable)'}
      >
        <img className={'tentacle'} draggable={false} src={iconURL} />
      </button>
      {error && (
        <span className={'error-message'}>
          {error}
          <RoundIconButton
            sx={{ ml: 1 }}
            variant="danger"
            size="small"
            aria-label={'Reload Gitako'}
            icon={SyncIcon}
            onClick={reload}
          />
        </span>
      )}
      {children}
    </div>
  )
}
