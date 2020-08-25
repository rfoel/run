import useSWR from 'swr'
import styled from 'styled-components'

import ContentLoader from './ContentLoader'
import Error from '../components/Error'
import formatPace from '../utils/formatPace'
import MutedText from './MutedText'
import Text from './Text'
import { Row, Column } from './Grid'
import { WORLD_RECORD } from '../utils/constants'

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
  const { data: totalRuns, error: totalRunsError } = useSWR('/api/total-runs')
  const { data: averageDistance, error: averageDistanceError } = useSWR(
    '/api/average-distance',
  )
  const { data: averagePace, error: averagePaceError } = useSWR(
    '/api/average-pace',
  )

  const error = totalRunsError || averageDistanceError || averagePaceError
  const isLoading = !totalRuns || !averageDistance || !averagePace || error

  return (
    <StyledInfo>
      <Row>
        <Column as={ContentLoader} isLoading={isLoading}>
          <Text>{totalRuns || 999}</Text>
          <MutedText>Total runs</MutedText>
        </Column>
        <Column as={ContentLoader} isLoading={isLoading}>
          <Text>{((totalRuns * 100) / WORLD_RECORD).toFixed(2)}%</Text>
          <MutedText>WR progress</MutedText>
        </Column>
        <Column as={ContentLoader} isLoading={isLoading}>
          <Text>{(averageDistance / 1000).toFixed(2)} km</Text>
          <MutedText>Average distance</MutedText>
        </Column>
        <Column as={ContentLoader} isLoading={isLoading}>
          <Text>{formatPace(averagePace)}</Text>
          <MutedText>Average pace</MutedText>
        </Column>
      </Row>
    </StyledInfo>
  )
}

export default Info
