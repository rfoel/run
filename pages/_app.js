import Head from 'next/head'
import { RecoilRoot } from 'recoil'

import Wrapper from '../components/Wrapper'
import '../styles/index.css'

function App({ Component, pageProps }) {
  return (
    <RecoilRoot>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta name="description" content="Rafael's run every day" />
        <title>Run every day</title>
      </Head>
      <Wrapper>
        <Component {...pageProps} />
      </Wrapper>
    </RecoilRoot>
  )
}

export default App
