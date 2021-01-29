import { NextPage } from 'next'
import { ReactElement, useEffect } from 'react'
import useSWR from 'swr'

import Header from '../components/Header'
import Info from '../components/Info'
import Period from '../components/Period'
import Runs from '../components/Runs'
import useGlobalState from '../hooks/useGlobalState'

const IndexPage: NextPage = (): ReactElement => {
  const { data: streaks } = useSWR('/api/streaks')
  const { data: years } = useSWR('/api/years')
  const [, setState] = useGlobalState()

  useEffect((): void => {
    if (streaks) {
      setState({ streaks })
    }
    if (years) {
      setState({ years })
    }
  }, [streaks, years])

  return (
    <>
      <Header />
      <Period />
      <Info />
      <Runs />
    </>
  )
}

export default IndexPage
