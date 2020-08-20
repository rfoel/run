import useSWR from 'swr'
import styled from 'styled-components'

import formatPace from '../utils/formatPace'
import { WORLD_RECORD } from '../utils/constants'
import Error from '../components/Error'
import MutedText from './MutedText'
import Text from './Text'
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

const Info = () => {
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
          <Text>{((totalRuns * 100) / WORLD_RECORD).toFixed(2)}%</Text>
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

export default Info
