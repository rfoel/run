import dayjs from 'dayjs'
import styled, { css } from 'styled-components'
import { down } from 'styled-breakpoints'

import calculatePace from '../utils/calculatePace'
import formatDate from '../utils/formatDate'
import formatPace from '../utils/formatPace'
import formatTime from '../utils/formatTime'

import MutedText from './MutedText'
import Text from './Text'
import Map from './Map'
import Logo from '../images/run.svg'
import { Row, Column } from './Grid'

const StyledRun = styled.div(
  () => css`
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
  max-height: 164px;

  ${down('sm')} {
    text-align: center;
  }
`

const Run = ({
  date,
  day,
  distance,
  location,
  time,
  summaryPolyline,
  weather,
}) => (
  <StyledRun>
    <Row>
      <Outline align="center" justify="center" sm={2}>
        {summaryPolyline ? <Map summaryPolyline={summaryPolyline} /> : <Logo />}
      </Outline>
      <Column sm={2} md={3} lg={6}>
        <Row align="flex-start">
          <Column>
            <MutedText>
              {formatDate(date)} at {dayjs(date).format('HH:mm')}
            </MutedText>
          </Column>
          <Column>
            <MutedText>
              {location?.city}, {location?.country}
            </MutedText>
          </Column>
          <Column>
            <MutedText>
              {weather?.temperature}°C, {weather?.condition}
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
            <MutedText>{formatTime(time)}</MutedText>
          </Column>
        </Row>
      </Column>
    </Row>
  </StyledRun>
)

export default Run
