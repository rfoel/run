import type { AppProps } from 'next/app'
import Head from 'next/head'
import { ReactElement } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { SWRConfig } from 'swr'

import Layout from '../components/Layout'
import { GlobalStateProvider } from '../hooks/useGlobalState'
import fetcher from '../utils/fetcher'
import initialState from '../utils/initialState'

const ErrorFallback = ({ error }: { error: Error }): ReactElement => (
  <h1>{error.message}</h1>
)

const App = ({ Component, pageProps }: AppProps): ReactElement => {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no"
        />
        <meta name="theme-color" content="#1b262c" />
        <meta
          name="description"
          content="Generate random data from selected resources"
        />

        <link rel="manifest" href="/manifest.json" />
        <link href="/favicon.png" rel="icon" type="image/png" sizes="64x64" />
        <link href="/logo192.png" rel="icon" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/logo512.png"></link>
      </Head>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <SWRConfig
          value={{
            fetcher,
            revalidateOnFocus: false,
            errorRetryInterval: 500,
          }}
        >
          <Layout>
            <GlobalStateProvider initialState={initialState}>
              <Component {...pageProps} />
            </GlobalStateProvider>
          </Layout>
        </SWRConfig>
      </ErrorBoundary>
    </>
  )
}

export default App
