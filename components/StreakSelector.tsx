import dayjs from 'dayjs'
import equal from 'fast-deep-equal'
import { ReactElement, useEffect, useState } from 'react'
import styled, { css } from 'styled-components'

import useGlobalState from '../hooks/useGlobalState'
import { DATE_FORMAT } from '../utils/constants'

import Button from './Button'
import HiddenInput from './HiddenInput'
import Modal from './Modal'
import SelectorLabel from './SelectorLabel'

const Wrapper = styled.div`
  cursor: pointer;
`

const Selector = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  padding: 16px 24px;

  ${Button} {
    margin-top: 32px;
  }
`

const Option = styled.label<{ checked: boolean }>(
  ({ checked, theme: { colors } }): any => css`
    border-radius: 8px;
    cursor: pointer;
    margin: 4px;
    padding: 8px;
    text-align: center;
    width: 100%;

    ${checked &&
    css`
      background-color: ${colors.whisper};
    `}
  `,
)

const StreakSelector = (): ReactElement | null => {
  const [state, setState] = useGlobalState()
  const [isOpen, setIsOpen] = useState(false)

  if (!state.streaks) {
    return null
  }

  const [{ value, label }, setValue] = useState(state.streaks[0])

  useEffect((): void => {
    handleClick()
  }, [])

  const handleClick = (): void => {
    setState({
      range: {
        label,
        value: {
          start: dayjs(value.start).format(DATE_FORMAT),
          end: dayjs(value.end).format(DATE_FORMAT),
        },
      },
    })
    setIsOpen(false)
  }

  const handleClose = (event?: Event): void => {
    event?.stopPropagation()
    setIsOpen(false)
  }

  return (
    <Wrapper onClick={(): void => setIsOpen(true)}>
      <SelectorLabel>{state.range?.label}</SelectorLabel>
      <Modal isOpen={isOpen} handleClose={handleClose}>
        <Selector>
          {state.streaks?.map(
            (streak): ReactElement => {
              const checked = equal(streak.value, value)
              return (
                <Option key={streak.label} checked={checked}>
                  <HiddenInput
                    defaultChecked={checked}
                    name="range"
                    type="radio"
                    onClick={(): void => setValue(streak)}
                  />
                  {streak.label}
                </Option>
              )
            },
          )}
        </Selector>
        <Button onClick={handleClick}>Select</Button>
      </Modal>
    </Wrapper>
  )
}

export default StreakSelector
