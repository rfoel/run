import React from 'react'
import { node } from 'prop-types'
import { SWRConfig } from 'swr'
import { ThemeProvider } from 'styled-components'

import Layout from './Layout'
import getTheme from '../utils/theme'

function Wrapper({ children }) {
  return (
    <SWRConfig
      value={{ fetcher: (...args) => fetch(...args).then(res => res.json()) }}
    >
      <ThemeProvider theme={getTheme()}>
        <Layout>{children}</Layout>
      </ThemeProvider>
    </SWRConfig>
  )
}

Wrapper.propTypes = {
  children: node.isRequired,
}

export default Wrapper
