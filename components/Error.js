import React from 'react'
import styled from 'styled-components'

import ExclamationTriangle from '../images/exclamation-triangle.svg'

const StyledError = styled.div`
  color: currentColor;
  width: 200px;

  svg {
    width: 100%;
  }
`

export default function Error() {
  return (
    <StyledError>
      <ExclamationTriangle />
    </StyledError>
  )
}
