import { useRecoilState } from 'recoil'
import styled from 'styled-components'

import Run from '../images/run.svg'
import Switch from './Switch'
import { darkModeState } from '../utils/theme'

const StyledNav = styled.nav`
  align-items: center;
  color: currentColor;
  display: flex;
  justify-content: space-between;
  padding: 16px;
  width: 100%;

  svg {
    width: 46px;
  }
`

export default function Nav() {
  const [darkMode, setDarkMode] = useRecoilState(darkModeState)

  return (
    <StyledNav>
      <Run />
      <Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
    </StyledNav>
  )
}
