import { useEffect } from 'react'
import useSWR, { useSWRInfinite } from 'swr'

import Box from './Box'
import Container from './Container'
import Run from './Run'
import Text from './Text'
import useGlobalState from '../hooks/useGlobalState'
import useIsBottomOfThePage from '../hooks/useIsBottomOfThePage'

const Runs = () => {
  const limit = 7
  const [state] = useGlobalState()
  const query = new URLSearchParams(state.range.value)
  const { data, error, size, setSize } = useSWRInfinite(index => {
    return `/api/runs?${query}&limit=${limit}&skip=${index * limit}`
  })
  const { data: totalRuns } = useSWR(`/api/total-runs?${query}`)

  const isBottom = useIsBottomOfThePage()

  useEffect(() => {
    if (isBottom && totalRuns > size * limit) setSize(size + 1)
  }, [isBottom])

  const runs = data ? [].concat(...data) : []

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
