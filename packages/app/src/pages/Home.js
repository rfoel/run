import React from 'react'
import { useQuery } from 'react-query'
import { Box, Heading } from '@1e3/ui'

import Error from '../components/Error'
import Loader from '../components/Loader'

import { fetchCount } from '../utils'

export default () => {
  const { status, data, error } = useQuery('count', fetchCount)

  if (status === 'loading') return <Loader />

  if (error) return <Error />

  return (
    <Box>
      <Heading>I ran {data.count} days in a row</Heading>
    </Box>
  )
}
