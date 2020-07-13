import React from 'react'
import useSWR from 'swr'

import Error from '../components/Error'
import Text from '../components/Text'
import Loader from '../components/Loader'
import Page from '../components/Page'

export default function Home() {
  const { data, error } = useSWR('/api/count')

  if (error) return <Error />
  if (!data) return <Loader />

  return (
    <Page>
      <Text as="h1">I ran {data.count} days in a row</Text>
    </Page>
  )
}
