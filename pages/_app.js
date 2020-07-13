import Head from 'next/head'

import Wrapper from '../components/Wrapper'
import '../styles/index.css'

function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Run every day</title>
      </Head>
      <Wrapper>
        <Component {...pageProps} />
      </Wrapper>
    </>
  )
}

export default App
