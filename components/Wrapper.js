import React from 'react'
import { SWRConfig } from 'swr'
import { node } from 'prop-types'
import { ThemeProvider } from 'styled-components'

import Layout from './Layout'

const theme = { colors: { primary: { base: '#fe5969', contrast: '#11269c' } } }

function Wrapper({ children }) {
  return (
    <SWRConfig
      value={{ fetcher: (...args) => fetch(...args).then(res => res.json()) }}
    >
      <ThemeProvider theme={theme}>
        <Layout>{children}</Layout>
      </ThemeProvider>
    </SWRConfig>
  )
}

Wrapper.propTypes = {
  children: node.isRequired,
}

export default Wrapper
