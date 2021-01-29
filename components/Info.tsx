import { ReactElement } from 'react'
import useSWR from 'swr'

import useGlobalState from '../hooks/useGlobalState'
import formatNumber from '../utils/formatNumber'
import formatPace from '../utils/formatPace'
import formatTime from '../utils/formatTime'

import Box from './Box'
import Container from './Container'
import InfoItem from './InfoItem'

const Info = (): ReactElement | null => {
  const [state] = useGlobalState()

  if (!state.range) {
    return null
  }

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
