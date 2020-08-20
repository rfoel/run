import { useRecoilState } from 'recoil'
import styled from 'styled-components'

import Run from '../images/run.svg'
import Switch from './Switch'
import { darkModeAtom } from '../utils/theme'

const StyledNavbar = styled.nav`
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

const Navbar = () => {
  const [darkMode, setDarkMode] = useRecoilState(darkModeAtom)

  return (
    <StyledNavbar>
      <Run />
      <Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
    </StyledNavbar>
  )
}

export default Navbar
