import React from 'react'
import { node } from 'prop-types'
import styled from 'styled-components'

import Footer from './Footer'
import Navbar from './Navbar'

const Children = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  width: 100%;
`

const Container = styled.div`
  align-items: center;
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  justify-content: center;
  width: 100%;
`

function Page({ children }) {
  return (
    <Container>
      <Navbar />
      <Children>{children}</Children>
      <Footer />
    </Container>
  )
}

Page.propTypes = {
  children: node.isRequired,
}

export default Page
