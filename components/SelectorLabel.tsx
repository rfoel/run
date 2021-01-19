import { FunctionComponent } from 'react'
import styled, { css } from 'styled-components'

import ArrowDown from '../images/arrow-down.svg'

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

type Props = { withIcon: boolean }

const SelectorLabel: FunctionComponent = ({
  children,
  withIcon = true,
}: Props) => (
  <Wrapper alignItems="center" display="flex" my={3}>
    {children} {withIcon && <ArrowDown />}
  </Wrapper>
)

export default SelectorLabel
