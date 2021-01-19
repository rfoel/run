import useSWR from 'swr'

import Box from './Box'
import Container from './Container'
import Run from './Run'
import Text from './Text'
import useGlobalState from '../hooks/useGlobalState'

const Runs = () => {
  const [state] = useGlobalState()
  const query = new URLSearchParams(state.range.value)
  const { data: runs = [] } = useSWR(`/api/runs?${query}`)

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
