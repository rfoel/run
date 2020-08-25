import React from 'react'

import Header from '../components/Header'
import Info from '../components/Info'
import Page from '../components/Page'
import Runs from '../components/Runs'

const Home = () => {
  return (
    <Page>
      <Header />
      <Info />
      <Runs />
    </Page>
  )
}

export default Home
