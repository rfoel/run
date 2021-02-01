import styled, { css } from 'styled-components'

import GitHub from '../images/github.svg'
import Twitter from '../images/twitter.svg'

import Box from './Box'

const Link = styled.a(
  ({ theme: { colors } }) => css`
    color: ${colors.black};
    margin-left: 16px;

    svg {
      max-height: 24px;
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
      <Box as="span" display="none">
        GitHub
      </Box>
    </Link>
    <Link
      href="https://twitter.com/rfoel"
      rel="noreferrer noopener"
      target="_blank"
    >
      <Twitter />
      <Box as="span" display="none">
        Twitter
      </Box>
    </Link>
  </Box>
)

export default Social
