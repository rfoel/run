import styled from 'styled-components'

import formatPace from '../utils/formatPace'

import MutedText from './MutedText'
import Text from './Text'
import useSWR from 'swr'

import Error from '../components/Error'
import { Row, Column } from './Grid'

const StyledInfo = styled.div`
  width: 100%;

  ${Column}, ${Row} {
    align-items: center;
    justify-content: center;
  }

  ${Column} {
    height: 156px;
  }

  ${Text} {
    font-size: 40px;
  }

  ${MutedText} {
    font-size: 16px;
  }
`

export default function Info() {
  const { data: { totalRuns } = {}, error: totalRunsError } = useSWR(
    '/api/total-runs',
  )
  const {
    data: { averageDistance } = {},
    error: averageDistanceError,
  } = useSWR('/api/average-distance')
  const { data: { averagePace } = {}, error: averagePaceError } = useSWR(
    '/api/average-pace',
  )

  if (totalRunsError || averageDistanceError || averagePaceError)
    return <Error />
  if (!totalRuns || !averageDistance || !averagePace) return null

  return (
    <StyledInfo>
      <Row>
        <Column sm={4}>
          <Text>{totalRuns}</Text>
          <MutedText>Total runs</MutedText>
        </Column>
        <Column sm={4}>
          <Text>0.93</Text>
          <MutedText>WR progress</MutedText>
        </Column>
        <Column sm={4}>
          <Text>{(averageDistance / 1000).toFixed(2)} km</Text>
          <MutedText>Average distance</MutedText>
        </Column>
        <Column sm={4} md={4}>
          <Text>{formatPace(averagePace)}</Text>
          <MutedText>Average pace</MutedText>
        </Column>
      </Row>
    </StyledInfo>
  )
}
