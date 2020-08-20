import React from 'react'
import styled from 'styled-components'

import ExclamationTriangle from '../images/exclamation-triangle.svg'

const StyledError = styled.div`
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

const Error = () => (
  <StyledError>
    <ExclamationTriangle />
  </StyledError>
)

export default Error
