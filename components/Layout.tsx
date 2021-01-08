import React, { FunctionComponent } from 'react'
import styled, { css, ThemeProvider } from 'styled-components'

import GlobalStyles from './GlobalStyles'
import theme from '../utils/theme'

const Container = styled.div(
  ({ theme: { colors } }) => css`
    color: ${colors.black};
    width: 100%;
  `,
)

const Layout: FunctionComponent = ({ children }) => {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <Container>{children}</Container>
    </ThemeProvider>
  )
}

export default Layout
