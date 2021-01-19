import { FunctionComponent } from 'react'
import useSWR from 'swr'

import Box from './Box'
import Container from './Container'
import formatNumber from '../utils/formatNumber'
import formatPace from '../utils/formatPace'
import InfoItem from './InfoItem'
import formatTime from '../utils/formatTime'
import useGlobalState from '../hooks/useGlobalState'

const Info: FunctionComponent = () => {
  const [state] = useGlobalState()
  const query = new URLSearchParams(state.range.value)

  const { data: averagePace } = useSWR(`/api/average-pace?${query}`)
  const { data: totalDistance } = useSWR(`/api/total-distance?${query}`)
  const { data: totalRuns } = useSWR(`/api/total-runs?${query}`)
  const { data: totalTime } = useSWR(`/api/total-time?${query}`)

  return (
    <Container>
      <Box>
        <InfoItem
          isLoading={totalDistance === undefined}
          label="Kilometers"
          size="lg"
          title={formatNumber(totalDistance / 1000, {
            maximumFractionDigits: 1,
          })}
        />
      </Box>
      <Box display="flex" mt={3}>
        <Box mr={4} width="auto">
          <InfoItem
            isLoading={totalRuns === undefined}
            label="Runs"
            title={formatNumber(totalRuns)}
          />
        </Box>
        <Box mr={4} width="auto">
          <InfoItem
            isLoading={averagePace === undefined}
            label="Avg. Pace"
            title={formatPace(averagePace)}
          />
        </Box>
        <Box mr={4} width="auto">
          <InfoItem
            isLoading={totalTime === undefined}
            label="Time"
            title={formatTime(totalTime)}
          />
        </Box>
      </Box>
    </Container>
  )
}

export default Info
