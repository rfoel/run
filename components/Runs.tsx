import { useEffect } from 'react'
import useSWR, { useSWRInfinite } from 'swr'

import useGlobalState from '../hooks/useGlobalState'
import useIsBottomOfThePage from '../hooks/useIsBottomOfThePage'
import { Run as DbRun } from '../models'

import Box from './Box'
import Container from './Container'
import Run from './Run'
import Text from './Text'

const Runs = () => {
  const limit = 7
  const [state] = useGlobalState()

  if (!state.range) {
    return null
  }

  const query = new URLSearchParams(state.range.value)
  const { data, size, setSize } = useSWRInfinite(index => {
    return `/api/runs?${query}&limit=${limit}&skip=${index * limit}`
  })
  const { data: totalRuns } = useSWR(`/api/total-runs?${query}`)

  const isBottom = useIsBottomOfThePage()

  useEffect(() => {
    if (isBottom && totalRuns > size * limit) {
      setSize(size + 1)
    }
  }, [isBottom])

  const runs: DbRun[] = data ? [].concat(...data) : []

  return (
    <Box bg="whisper" flex="1 0 100%" mt={4} padding={3}>
      <Container>
        <Text as="h3" my={3}>
          Recent Activity
        </Text>
        {runs.map(run => (
          <Run key={run._id} {...run} />
        ))}
      </Container>
    </Box>
  )
}

export default Runs
