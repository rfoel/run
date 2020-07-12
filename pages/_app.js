import Wrapper from '../components/Wrapper'

export default function App({ Component, pageProps }) {
  return (
    <Wrapper>
      <Component {...pageProps} />
    </Wrapper>
  )
}
