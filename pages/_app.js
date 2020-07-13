import Head from 'next/head'
import { RecoilRoot } from 'recoil'

import Wrapper from '../components/Wrapper'
import '../styles/index.css'

function App({ Component, pageProps }) {
  return (
    <RecoilRoot>
      <Head>
        <title>Run every day</title>
      </Head>
      <Wrapper>
        <Component {...pageProps} />
      </Wrapper>
    </RecoilRoot>
  )
}

export default App
