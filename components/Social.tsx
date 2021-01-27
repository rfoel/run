import Box from './Box'
import GitHub from '../images/github.svg'
import Twitter from '../images/twitter.svg'
import styled, { css } from 'styled-components'

const Link = styled.a(
  ({ theme: { colors } }) => css`
    color: ${colors.black};
    margin-left: 16px;

    svg {
      height: 24px;
    }
  `,
)

const Social = () => (
  <Box pt={2} width="auto">
    <Link
      href="https://github.com/rfoel/run"
      rel="noreferrer noopener"
      target="_blank"
    >
      <GitHub />
    </Link>
    <Link
      href="https://twitter.com/rfoel"
      rel="noreferrer noopener"
      target="_blank"
    >
      <Twitter />
    </Link>
  </Box>
)

export default Social
