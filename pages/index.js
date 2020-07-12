import React from 'react'
import useSWR from 'swr'

import Error from '../components/Error'
import Heading from '../components/Heading'
import Loader from '../components/Loader'

export default function Home() {
  const { data, error } = useSWR('/api/count')

  if (error) return <Error />
  if (!data) return <Loader />

  return <Heading>I ran {data.count} days in a row</Heading>
}
