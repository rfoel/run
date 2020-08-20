import styled from 'styled-components'

import Text from './Text'

const StyledFooter = styled.footer`
  margin-top: 32px;
  padding: 16px;
  text-align: center;

  a {
    color: currentColor;
    text-decoration: none;
  }
`

const Footer = () => (
  <StyledFooter>
    <Text>{new Date().getFullYear()}</Text>
    {' | '}
    <Text
      as="a"
      href="https://twitter.com/rfoel"
      rel="noreferrer"
      target="_blank"
    >
      rfoel
    </Text>
    {' | '}
    <Text
      as="a"
      href="https://github.com/rfoel/run"
      rel="noreferrer"
      target="_blank"
    >
      source code
    </Text>
  </StyledFooter>
)

export default Footer
