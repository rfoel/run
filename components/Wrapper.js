import React from 'react'
import { SWRConfig } from 'swr'
import { node } from 'prop-types'
import styled, { css, ThemeProvider } from 'styled-components'

import GlobalStyle from './GlobalStyle'

const theme = { colors: { primary: { base: '#fe5969', contrast: '#11269c' } } }

const Container = styled.div(
  ({
    theme: {
      colors: { primary },
    },
  }) =>
    css`
      align-items: center;
      background-color: ${primary.base};
      color: ${primary.contrast};
      display: flex;
      justify-content: center;
      height: 100%;
      width: 100%;
    `,
)

export default function Layout({ children }) {
  return (
    <SWRConfig
      value={{ fetcher: (...args) => fetch(...args).then(res => res.json()) }}
    >
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <Container>{children}</Container>
      </ThemeProvider>
    </SWRConfig>
  )
}

Layout.propTypes = {
  children: node.isRequired,
}
