import Head from 'next/head'
import { node } from 'prop-types'
import { useRecoilState } from 'recoil'
import { SWRConfig } from 'swr'
import { ThemeProvider } from 'styled-components'

import Layout from './Layout'
import getTheme from '../utils/theme'
import { darkModeState } from '../utils/theme'

function Wrapper({ children }) {
  const [darkMode] = useRecoilState(darkModeState)

  return (
    <SWRConfig
      value={{ fetcher: (...args) => fetch(...args).then(res => res.json()) }}
    >
      <Head>
        <link rel="icon" href={`/favicon-${darkMode ? 'dark' : 'light'}.png`} />
        <link
          rel="apple-touch-icon"
          href={`/logo192-${darkMode ? 'dark' : 'light'}.png`}
        />
        <link
          rel="apple-touch-icon"
          href={`/logo512-${darkMode ? 'dark' : 'light'}.png`}
        />
      </Head>
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