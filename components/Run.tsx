import dayjs from 'dayjs'

import Box from './Box'
import calculatePace from '../utils/calculatePace'
import formatPace from '../utils/formatPace'
import formatTime from '../utils/formatTime'
import InfoItem from './InfoItem'
import Map from './Map'
import Text from './Text'
import { Run as DbRun } from '../models/run'
import formatNumber from '../utils/formatNumber'

type Props = DbRun

const Run = (run: Props) => {
  return (
    <Box bg="white" borderRadius={8} my={3} padding={3}>
      <Box display="flex">
        <Box mr={4} width="auto">
          <Map map={run.map} />
        </Box>
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
