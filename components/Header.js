import React from 'react'
import styled from 'styled-components'

import Run from '../images/run.svg'
import Text from './Text'

const StyledHeader = styled.header`
  align-items: center;
  color: currentColor;
  display: flex;
  justify-content: space-between;
  padding: 16px;
  width: 100%;

  a {
    text-decoration: none;
  }

  svg {
    width: 46px;
  }
`

export default function Header() {
  return (
    <StyledHeader>
      <Run />
      <Text
        as="a"
        href="https://github.com/rfoel/run"
        rel="noreferrer"
        target="_blank"
      >
        source code
      </Text>
    </StyledHeader>
  )
}
