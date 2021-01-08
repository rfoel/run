import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import styled, { css } from 'styled-components'
import equal from 'deepequal'

import Button from './Button'
import HiddenInput from './HiddenInput'
import Modal from './Modal'
import SelectorLabel from './SelectorLabel'
import useGlobalState from '../hooks/useGlobalState'
import { getMonthNames, getWeeks } from '../utils/period'
import { DATE_FORMAT } from '../utils/constants'

const Wrapper = styled.div(
  () => css`
    cursor: pointer;

    ${Button} {
      margin-top: 24px;
    }
  `,
)

const Selector = styled.div(
  ({ theme: { colors } }) => css`
    align-items: center;
    display: flex;
    justify-content: center;
    overflow: hidden;
    padding: 16px 24px;
  `,
)

const Options = styled.div(
  () => css`
    display: flex;
    flex-direction: column;
    height: 150px;
    padding: 16px 32px;
    overflow-y: scroll;
  `,
)

const Option = styled.label(
  ({ selected, theme: { colors } }) => css`
    border-radius: 8px;
    cursor: pointer;
    margin: 4px;
    padding: 8px;
    text-align: center;
    user-select: none;
    width: 100%;

    ${selected &&
    css`
      background-color: ${colors.whisper};
    `}
  `,
)

const MonthSelector = () => {
  const [state, setState] = useGlobalState()
  const [isOpen, setIsOpen] = useState(false)

  const monthNames = getMonthNames()

  const [month, setMonth] = useState(dayjs().month())
  const [year, setYear] = useState(dayjs().year().toString())

  useEffect(() => {
    handleClick()
  }, [])

  const handleClick = () => {
    setState({
      range: {
        value: {
          start: dayjs()
            .month(month)
            .year(year)
            .startOf('month')
            .format(DATE_FORMAT),
          end: dayjs()
            .month(month)
            .year(year)
            .endOf('month')
            .format(DATE_FORMAT),
        },
        label: dayjs().month(month).year(year).format('MMMM YYYY'),
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
          <Options>
            {monthNames.map((value, index) => (
              <Option key={value} selected={month === index}>
                <HiddenInput
                  defaultChecked={month === index}
                  name="range"
                  type="radio"
                  onClick={() => setMonth(index)}
                />
                {value}
              </Option>
            ))}
          </Options>
          <Options>
            {state.years.map(value => (
              <Option key={value} selected={year === value}>
                <HiddenInput
                  defaultChecked={year === value}
                  name="range"
                  type="radio"
                  onClick={() => setYear(value)}
                />
                {value}
              </Option>
            ))}
          </Options>
        </Selector>
        <Button onClick={handleClick}>Select</Button>
      </Modal>
    </Wrapper>
  )
}

export default MonthSelector
