import dayjs from 'dayjs'
import { ReactElement } from 'react'
import ContentLoader from 'styled-content-loader'
import useSWR from 'swr'

import { Run as DbRun } from '../models/run'
import calculatePace from '../utils/calculatePace'
import formatNumber from '../utils/formatNumber'
import formatPace from '../utils/formatPace'
import formatTime from '../utils/formatTime'

import Box from './Box'
import InfoItem from './InfoItem'
import Text from './Text'

type Props = DbRun

const Run = (run: Props): ReactElement => {
  const query = new URLSearchParams({
    polyline: encodeURIComponent(run.polyline),
  })
  const { data: { map } = {} } = useSWR(`/api/map?${query}`)

  return (
    <Box bg="white" borderRadius={8} my={3} padding={3}>
      <Box display="flex">
        <ContentLoader isLoading={Boolean(!map)}>
          <Box mr={3} height="70px" width="70px">
            {map && (
              <Box
                alt={run.name}
                as="img"
                src={`data:image/png;base64, ${map}`}
              />
            )}
          </Box>
        </ContentLoader>
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="space-evenly"
        >
          <Box>
            <Text fontSize={1}>{dayjs(run.date).format('DD/MM/YYYY')}</Text>
          </Box>
          <Box>
            <Text color="gray" fontSize={1}>
              {run.name}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box display="flex" justifyContent="flex-start" mt={3}>
        <Box mr={4} width="auto">
          <InfoItem
            label="Km"
            size="sm"
            title={formatNumber(run.distance / 1000, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          />
        </Box>
        <Box mr={4} width="auto">
          <InfoItem
            label="Avg. Pace"
            size="sm"
            title={formatPace(calculatePace(run.distance, run.time))}
          />
        </Box>
        <Box mr={4} width="auto">
          <InfoItem label="Time" size="sm" title={formatTime(run.time)} />
        </Box>
      </Box>
    </Box>
  )
}

export default Run
