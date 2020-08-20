import React from 'react'
import styled from 'styled-components'

import Run from '../images/run.svg'

const StyledLoader = styled.div`
  align-items: center;
  color: currentColor;
  display: flex;
  height: 100%;
  justify-content: center;
  width: 100%;

  svg {
    width: 100px;
  }
`

const Loader = () => (
  <StyledLoader>
    <Run />
  </StyledLoader>
)

export default Loader
