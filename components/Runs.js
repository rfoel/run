import React, { useEffect } from 'react'
import { useSWRInfinite } from 'swr'

import Error from './Error'
import Run from './Run'
import useIsBottomOfThePage from '../hooks/useIsBottomOfThePage'

const Runs = () => {
  const limit = 10
  const { data, error, size, setSize } = useSWRInfinite(
    index => `/api/runs?limit=${limit}&skip=${index * limit}`,
  )
  const isBottom = useIsBottomOfThePage()

  useEffect(() => {
    if (isBottom) setSize(size + 1)
  }, [isBottom])

  const runs = data ? [].concat(...data) : []

  if (error) return <Error />

  return runs.map(run => <Run key={run._id} {...run} />)
}

export default Runs
