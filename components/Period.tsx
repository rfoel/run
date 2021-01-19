import styled, { css } from 'styled-components'

import AllSelector from './AllSelector'
import Container from './Container'
import HiddenInput from './HiddenInput'
import MonthSelector from './MonthSelector'
import useGlobalState from '../hooks/useGlobalState'
import WeekSelector from './WeekSelector'
import YearSelector from './YearSelector'

const Wrapper = styled.div(
  () => css`
    display: flex;
    margin-top: 96px;
  `,
)

const PeriodButtonWrapper = styled.div(
  ({ theme: { colors } }) => css`
    border-style: solid;
    border-color: ${colors.gainsboro};
    border-top-width: 1px;
    border-bottom-width: 1px;
    border-left: none;
    border-right: none;

    &:first-child {
      border-right-width: 0;
      border-left-width: 1px;
      border-left-style: solid;
      border-left-color: ${colors.gainsboro};
      border-top-left-radius: 9999px;
      border-bottom-left-radius: 9999px;
    }

    &:last-child {
      border-left-width: 0;
      border-right-width: 1px;
      border-right-style: solid;
      border-right-color: ${colors.gainsboro};
      border-top-right-radius: 9999px;
      border-bottom-right-radius: 9999px;
    }
  `,
)

const PeriodButton = styled.label(
  ({ checked, theme: { colors } }) => css`
    align-items: center;
    background-color: transparent;
    border-radius: 9999px;
    box-sizing: border-box;
    color: ${colors.gray};
    cursor: pointer;
    display: flex;
    flex: 1 1 0%;
    height: 32px;
    justify-content: center;
    padding-left: 32px;
    padding-right: 32px;
    user-select: none;
    white-space: nowrap;
    width: 80px;

    ${checked &&
    css`
      background-color: ${colors.black};
      box-shadow: 0px 0px 0px 1px ${colors.black};
      color: ${colors.white};
    `}
  `,
)

const options = [
  { label: 'W', value: 'week' },
  { label: 'M', value: 'month' },
  { label: 'Y', value: 'year' },
  { label: 'All', value: 'all' },
]

const Period = () => {
  const [state, setState] = useGlobalState()
  const handleChange = ({ target }) => setState({ period: target.value })

  return (
    <Container>
      <Wrapper role="radiogroup">
        {options.map((option, index) => (
          <PeriodButtonWrapper key={option.value}>
            <PeriodButton checked={option.value === state.period}>
              <HiddenInput
                checked={option.value === state.period}
                name="period"
                onChange={handleChange}
                value={option.value}
                type="radio"
              />
              {option.label}
            </PeriodButton>
          </PeriodButtonWrapper>
        ))}
      </Wrapper>
      {state.period === 'all' && <AllSelector />}
      {state.period === 'month' && <MonthSelector />}
      {state.period === 'week' && <WeekSelector />}
      {state.period === 'year' && <YearSelector />}
    </Container>
  )
}

export default Period
