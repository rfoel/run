import equal from 'fast-deep-equal'
import { ReactElement, useEffect, useState } from 'react'
import styled, { css } from 'styled-components'

import useGlobalState from '../hooks/useGlobalState'
import { getWeeks } from '../utils/period'

import Button from './Button'
import HiddenInput from './HiddenInput'
import Modal from './Modal'
import SelectorLabel from './SelectorLabel'

const Wrapper = styled.div(
  () => css`
    cursor: pointer;
  `,
)

const Selector = styled.div(
  () => css`
    align-items: center;
    display: flex;
    flex-direction: column;
    padding: 16px 24px;

    ${Button} {
      margin-top: 32px;
    }
  `,
)

const Option = styled.label<{ selected: boolean }>(
  ({ selected, theme: { colors } }): any => css`
    border-radius: 8px;
    cursor: pointer;
    margin: 4px;
    padding: 8px;
    text-align: center;
    width: 100%;

    ${selected &&
    css`
      background-color: ${colors.whisper};
    `}
  `,
)

const WeekSelector = (): ReactElement => {
  const [state, setState] = useGlobalState()
  const [isOpen, setIsOpen] = useState(false)

  const options = getWeeks()

  const [value, setValue] = useState(options[0])

  useEffect((): void => {
    handleClick()
  }, [])

  const handleClick = (): void => {
    setState({ range: value })
    setIsOpen(false)
  }

  const handleClose = (event?: Event): void => {
    event?.stopPropagation()
    setIsOpen(false)
  }

  return (
    <Wrapper onClick={() => setIsOpen(true)}>
      <SelectorLabel>{state.range?.label}</SelectorLabel>
      <Modal isOpen={isOpen} handleClose={handleClose}>
        <Selector>
          {options.map(
            (option): ReactElement => (
              <Option key={option.label} selected={equal(option, value)}>
                <HiddenInput
                  defaultChecked={equal(option, value)}
                  name="range"
                  type="radio"
                  onClick={() => setValue(option)}
                />
                {option.label}
              </Option>
            ),
          )}
          <Button onClick={handleClick}>Select</Button>
        </Selector>
      </Modal>
    </Wrapper>
  )
}

export default WeekSelector
