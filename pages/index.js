import React from 'react'
import useSWR from 'swr'

import Error from '../components/Error'
import Header from '../components/Header'
import Info from '../components/Info'
import Page from '../components/Page'
import Run from '../components/Run'

export default function Home() {
  const { data: { runs } = {}, error } = useSWR('/api/runs')

  if (error) return <Error />
  if (!runs) return null

  return (
    <Page>
      <Header />
      <Info />
      {runs.map(run => (
        <Run key={run._id} {...run} />
      ))}
    </Page>
  )
}
