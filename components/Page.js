import React from 'react'
import { node } from 'prop-types'
import styled from 'styled-components'

import Header from './Header'

const Children = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  justify-content: center;
`

const Container = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
`

function Page({ children }) {
  return (
    <Container>
      <Header />
      <Children>{children}</Children>
    </Container>
  )
}

Page.propTypes = {
  children: node.isRequired,
}

export default Page
