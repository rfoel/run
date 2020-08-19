import React from 'react'
import { node } from 'prop-types'
import styled, { css } from 'styled-components'

import { Grid } from './Grid'

const Container = styled.div(
  ({ theme: { colors } }) =>
    css`
      background-color: ${colors.base};
      color: ${colors.contrast};
      display: flex;
      flex: 1 0 auto;
      flex-direction: column;
      transition-property: all;
      transition-duration: 200ms;
      transition-timing-function: ease;
      width: 100%;

      > ${Grid} {
        display: flex;
        flex: 1 0 auto;
        flex-direction: column;
      }
    `,
)

const Layout = ({ children }) => (
  <Container>
    <Grid>{children}</Grid>
  </Container>
)

Layout.propTypes = {
  children: node.isRequired,
}

export default Layout
