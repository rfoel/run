import React from 'react'
import styled from 'styled-components'

import Run from '../images/run.svg'

const StyledLoader = styled.div`
  color: currentColor;
  width: 200px;

  svg {
    width: 100%;
  }
`

export default function Loader() {
  return (
    <StyledLoader>
      <Run />
    </StyledLoader>
  )
}
