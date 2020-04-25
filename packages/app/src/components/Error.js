import React from 'react'
import styled from 'styled-components'

import { ReactComponent as ExclamationTriangle } from '../images/exclamation-triangle.svg'

const Error = styled.div`
  color: white;
  width: 200px;

  svg {
    width: 100%;
  }
`

export default () => (
  <Error>
    <ExclamationTriangle />
  </Error>
)
