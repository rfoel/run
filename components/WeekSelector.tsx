import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import styled, { css } from 'styled-components'
import equal from 'deepequal'

import Button from './Button'
import HiddenInput from './HiddenInput'
import Modal from './Modal'
import SelectorLabel from './SelectorLabel'
import useGlobalState from '../hooks/useGlobalState'
import { getWeeks } from '../utils/period'

const Wrapper = styled.div(
  () => css`
    cursor: pointer;
  `,
)

const Selector = styled.div(
  ({ theme: { colors } }) => css`
    align-items: center;
    display: flex;
    flex-direction: column;
    padding: 16px 24px;

    ${Button} {
      margin-top: 32px;
    }
  `,
)

const Option = styled.label(
  ({ selected, theme: { colors } }) => css`
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

const WeekSelector = () => {
  const [state, setState] = useGlobalState()
  const [isOpen, setIsOpen] = useState(false)

  const options = getWeeks()

  const [value, setValue] = useState(options[0])

  useEffect(() => {
    handleClick()
  }, [])

  const handleClick = () => {
    setState({ range: value })
    setIsOpen(false)
  }

  const handleClose = event => {
    event.stopPropagation()
    setIsOpen(false)
  }

  return (
    <Wrapper onClick={() => setIsOpen(true)}>
      <SelectorLabel>{state.range?.label}</SelectorLabel>
      <Modal isOpen={isOpen} handleClose={handleClose}>
        <Selector>
          {options.map(option => (
            <Option key={option.label} selected={equal(option, value)}>
              <HiddenInput
                defaultChecked={equal(option, value)}
                name="range"
                type="radio"
                onClick={() => setValue(option)}
              />
              {option.label}
            </Option>
          ))}
          <Button onClick={handleClick}>Select</Button>
        </Selector>
      </Modal>
    </Wrapper>
  )
}

export default WeekSelector
