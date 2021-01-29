import styled, { css } from 'styled-components'

import Container from './Container'
import Run from '../images/run.svg'
import Social from './Social'

const StyledHeader = styled.header(
  () => css`
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: 24px 0;

    svg {
      height: 36px;
    }
  `,
)

const Header = () => (
  <Container>
    <StyledHeader>
      <Run />
      <Social />
    </StyledHeader>
  </Container>
)

export default Header
