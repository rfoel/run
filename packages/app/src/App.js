import React, { useEffect, useState } from 'react'
import styled from '@xstyled/styled-components'
import { Box, Heading, ThemeProvider } from '@1e3/ui'

import { getRunCount } from './utils'
import { ReactComponent as Logo } from './logo.svg'

const LogoWrapper = styled.div`
  color: white;
  width: 200px;

  svg {
    width: 100%;
    fill: currentColor;
  }
`
const App = () => {
  const [count, setCount] = useState(null)

  useEffect(() => {
    getRunCount().then(setCount)
  }, [count])

  return (
    <ThemeProvider>
      <Box
        alignItems="center"
        backgroundColor="primary.base"
        display="flex"
        justifyContent="center"
        height="100vh"
        width="100vw"
      >
        {count ? (
          <Heading color="white">I ran {count} days in a row</Heading>
        ) : (
          <LogoWrapper>
            <Logo />
          </LogoWrapper>
        )}
      </Box>
    </ThemeProvider>
  )
}

export default App
