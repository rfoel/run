import { FunctionComponent } from 'react'
import styled, { css } from 'styled-components'

import ArrowDown from '../images/arrow-down.svg'
import Box from './Box'

const Wrapper = styled.span(
  () => css`
    align-items: center;
    display: flex;
    margin: 24px 0 16px 0;

    svg {
      height: 18px;
      margin-left: 12px;
    }
  `,
)

const SelectorLabel: FunctionComponent = ({ children, withIcon = true }) => (
  <Wrapper alignItems="center" display="flex" my={3}>
    {children} {withIcon && <ArrowDown />}
  </Wrapper>
)

export default SelectorLabel
