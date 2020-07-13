import { useRecoilState } from 'recoil'
import styled from 'styled-components'

import Run from '../images/run.svg'
import Switch from './Switch'
import Text from './Text'
import { darkModeState } from '../utils/theme'

const StyledHeader = styled.header`
  align-items: center;
  color: currentColor;
  display: flex;
  justify-content: space-between;
  padding: 0 16px;
  width: 100%;

  svg {
    width: 46px;
  }
`

const Right = styled.header`
  align-items: center;
  color: currentColor;
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  width: 100%;

  a {
    color: currentColor;
    margin-left: 16px;
    text-decoration: none;
  }
`

export default function Header() {
  const [darkMode, setDarkMode] = useRecoilState(darkModeState)

  return (
    <StyledHeader>
      <Run />
      <Right>
        <Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
        <Text
          as="a"
          href="https://github.com/rfoel/run"
          rel="noreferrer"
          target="_blank"
        >
          source code
        </Text>
      </Right>
    </StyledHeader>
  )
}
