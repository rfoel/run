import { node, shape } from 'prop-types'

import Wrapper from '../components/Wrapper'
function App({ Component, pageProps }) {
  return (
    <Wrapper>
      <Component {...pageProps} />
    </Wrapper>
  )
}

App.propTypes = {
  Component: node,
  pageProps: shape({}),
}

export default App
