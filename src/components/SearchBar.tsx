import { AlertIcon, SearchIcon, XIcon } from '@primer/octicons-react'
import { Popover, Text, TextInput, TextInputProps } from '@primer/react'
import { useConfigs } from 'containers/ConfigsContext'
import React, { useCallback, useMemo, useRef } from 'react'
import { cx } from 'utils/cx'
import { formatWithShortcut, isValidRegexpSource } from 'utils/general'
import { useFocusOnPendingTarget } from './FocusTarget'
import { SearchMode } from './searchModes'
import { getIsSupportedRegex } from './searchModes/regexMode'

type Props = {
  value: string
  onSearch: (searchKey: string, searchMode: SearchMode) => void
} & Required<Pick<TextInputProps, 'onFocus'>>

export function SearchBar({ onSearch, onFocus, value }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)
  useFocusOnPendingTarget(
    'search',
    useCallback(() => ref.current?.focus(), []),
  )

  const configs = useConfigs()
  const { searchMode, focusSearchInputShortcut } = configs.value

  const toggleButtonDescription =
    searchMode === 'regex'
      ? 'Match file name with regular expression.'
      : `Match file path sequence with plain input.`

  const isInputValid = useMemo(
    () =>
      ({
        regex: isValidRegexpSource(value),
        fuzzy: true,
      }[searchMode]),
    [value, searchMode],
  )
  const isSupportedRegex = useMemo(
    () => !(searchMode === 'regex' && !getIsSupportedRegex(value)),
    [value, searchMode],
  )

  const tooltipText = value
    ? !isInputValid
      ? 'Invalid regular expression.'
      : !isSupportedRegex
      ? `Highlight is not supported for regular expression containing '?:', '?=', '?!', '?<=', or '?<!.'`
      : null
    : null

  const [focused, setFocused] = React.useState(false)

  return (
    <React.Fragment>
      {!!tooltipText && (
        <div style={{ position: 'relative' }}>
          <Popover open={!!tooltipText} caret="bottom" sx={{ bottom: 0 }}>
            <Popover.Content sx={{ padding: 2, color: '#D73A49', width: `var(--gitako-width)` }}>
              <AlertIcon aria-label="alert" /> <Text>{tooltipText}</Text>
            </Popover.Content>
          </Popover>
        </div>
      )}
      <TextInput
        ref={ref}
        leadingVisual={SearchIcon}
        onFocus={e => {
          onFocus(e)
          setFocused(true)
          e.target.select()
        }}
        onBlur={() => setFocused(false)}
        block
        sx={{ borderRadius: 0 }}
        className={cx('search-input', { focused })}
        aria-label="Search files"
        placeholder={formatWithShortcut(`Search files`, focusSearchInputShortcut)}
        onChange={({ target: { value } }) => onSearch(value, searchMode)}
        value={value}
        trailingAction={
          <>
            <TextInput.Action
              disabled={!value}
              onClick={() => onSearch('', searchMode)}
              icon={XIcon}
              aria-label="Clear"
            />
            <TextInput.Action
              aria-label={toggleButtonDescription}
              sx={{ color: 'fg.subtle' }}
              onClick={() => {
                const newMode = searchMode === 'regex' ? 'fuzzy' : 'regex'
                configs.onChange({ searchMode: newMode })
                // Skip search if no input to prevent resetting folder expansions
                if (value) onSearch(value, newMode)
              }}
            >
              {searchMode === 'regex' ? '.*$' : 'a/b'}
            </TextInput.Action>
          </>
        }
      />
    </React.Fragment>
  )
}
