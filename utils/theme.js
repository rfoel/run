import { atom, useRecoilState } from 'recoil'

const black = '#000000'
const gray = '#888888'
const white = '#ffffff'

const grid = {
  columns: {
    sm: 2,
    md: 4,
    lg: 8,
  },
  breakpoints: ['sm', 'md', 'lg'],
  gutter: {
    sm: 20,
    md: 20,
    lg: 20,
  },
  width: {
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
  },
}

export const darkModeAtom = atom({
  key: 'darkMode',
  default: false,
})

export default function getTheme() {
  const [darkMode] = useRecoilState(darkModeAtom)
  const base = darkMode ? black : white
  const contrast = darkMode ? white : black
  const colors = { base, contrast, muted: gray }

  return { breakpoints: grid.width, colors, grid }
}
