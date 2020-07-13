import { atom, useRecoilState } from 'recoil'

const black = '#000000'
const white = '#ffffff'

export const darkModeState = atom({
  key: 'darkModeState',
  default: false,
})

export default function getTheme() {
  const [darkMode] = useRecoilState(darkModeState)
  const base = darkMode ? black : white
  const contrast = darkMode ? white : black
  const colors = { base, contrast }

  return { colors }
}
