import { NextPage } from 'next'
import { useEffect } from 'react'
import useSWR from 'swr'

import Info from '../components/Info'
import Period from '../components/Period'
import Runs from '../components/Runs'
import useGlobalState from '../hooks/useGlobalState'

const IndexPage: NextPage = () => {
  const { data } = useSWR('/api/years')
  const [, setState] = useGlobalState()

  useEffect(() => {
    if (data) setState(data)
  }, [data])

  return (
    <>
      <Period />
      <Info />
      <Runs />
    </>
  )
}

export default IndexPage
