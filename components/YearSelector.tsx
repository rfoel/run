import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import styled, { css } from 'styled-components'
import equal from 'deepequal'

import Button from './Button'
import HiddenInput from './HiddenInput'
import Modal from './Modal'
import SelectorLabel from './SelectorLabel'
import useGlobalState from '../hooks/useGlobalState'
import { DATE_FORMAT } from '../utils/constants'

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
  ({ checked, theme: { colors } }) => css`
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

const YearSelector = () => {
  const [state, setState] = useGlobalState()
  const [isOpen, setIsOpen] = useState(false)

  const [value, setValue] = useState(state.years[0])

  useEffect(() => {
    handleClick()
  }, [])

  const handleClick = () => {
    setState({
      range: {
        value: {
          start: dayjs().year(value).startOf('year').format(DATE_FORMAT),
          end: dayjs().year(value).endOf('year').format(DATE_FORMAT),
        },
        label: value,
      },
    })
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
          {state.years?.map(year => {
            const checked = year === value
            return (
              <Option key={year} checked={checked}>
                <HiddenInput
                  defaultChecked={checked}
                  name="range"
                  type="radio"
                  onClick={() => setValue(year)}
                />
                {year}
              </Option>
            )
          })}
        </Selector>
        <Button onClick={handleClick}>Select</Button>
      </Modal>
    </Wrapper>
  )
}

export default YearSelector
