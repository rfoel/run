import React from 'react'
import styled from 'styled-components'

import { ReactComponent as Run } from '../images/run.svg'

const Loader = styled.div`
  color: white;
  width: 200px;

  svg {
    width: 100%;
  }
`

export default () => (
  <Loader>
    <Run />
  </Loader>
)
