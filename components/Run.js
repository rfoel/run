import styled, { css } from 'styled-components'
import dayjs from 'dayjs'

import calculatePace from '../utils/calculatePace'
import formatPace from '../utils/formatPace'
import formatDate from '../utils/formatDate'

import MutedText from './MutedText'
import Text from './Text'
import Test from '../images/test.svg'
import { Row, Column } from './Grid'

const StyledRun = styled.div(
  () => css`
    height: 156px;
    margin: 24px 0;
    width: 100%;

    > ${Row} > ${Column} {
      padding: 24px;
    }

    ${Text} {
      font-size: 40px;
    }

    ${MutedText} {
      font-size: 16px;
    }
  `,
)

const Outline = styled.div`
  height: 120px;

  svg {
    height: 100%;
  }
`

export default function Run(run) {
  const { date, day, distance, location = {}, time, weather = {} } = run

  return (
    <StyledRun>
      <Row>
        <Column align="center" justify="center" sm={0} md={1} lg={2}>
          <Outline>
            <Test />
          </Outline>
        </Column>
        <Column sm={0} md={3} lg={6}>
          <Row align="flex-start">
            <Column>
              <MutedText>
                {formatDate(date)} at {dayjs(date).format('HH:mm')}
              </MutedText>
            </Column>
            <Column>
              <MutedText>
                {location.city}, {location.country}
              </MutedText>
            </Column>
            <Column>
              <MutedText>
                {weather.temperature}°C, {weather.condition}
              </MutedText>
            </Column>
          </Row>
          <Row align="center">
            <Column>
              <Text>Day {day}</Text>
            </Column>
          </Row>
          <Row align="flex-end">
            <Column>
              <MutedText>{(distance / 1000).toFixed(2)} km</MutedText>
            </Column>
            <Column>
              <MutedText>{formatPace(calculatePace(time, distance))}</MutedText>
            </Column>
            <Column>
              <MutedText>{dayjs(date).format('HH:mm')}</MutedText>
            </Column>
          </Row>
        </Column>
      </Row>
    </StyledRun>
  )
}
