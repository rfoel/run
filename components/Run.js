import dayjs from 'dayjs'
import styled, { css } from 'styled-components'
import { down } from 'styled-breakpoints'

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

const Outline = styled(Column)`
  max-width: 164px;

  svg {
    width: 100%;
  }

  ${down('sm')} {
    display: none;
  }
`

export default function Run(run) {
  const { date, day, distance, location, time, weather } = run

  return (
    <StyledRun>
      <Row>
        <Outline align="center" justify="center">
          <Test />
        </Outline>
        <Column sm={4} md={3} lg={6}>
          <Row align="flex-start">
            <Column>
              <MutedText>
                {formatDate(date)} at {dayjs(date).format('HH:mm')}
              </MutedText>
            </Column>
            {location && (
              <Column>
                <MutedText>
                  {location.city}, {location.country}
                </MutedText>
              </Column>
            )}
            {weather && (
              <Column>
                <MutedText>
                  {weather.temperature}°C, {weather.condition}
                </MutedText>
              </Column>
            )}
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
