import React from 'react'
import { ThemeProvider } from '@1e3/ui'

import GlobalStyle from './components/GlobalStyle'
import Layout from './components/Layout'
import Home from './pages/Home'

const App = () => {
  const theme = { colors: { primary: '#000' } }

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Layout>
        <Home />
      </Layout>
    </ThemeProvider>
  )
}

export default App
