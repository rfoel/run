declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      black: string
      gainsboro: string
      gray: string
      whisper: string
      white: string
      zambezi: string
    }
  }
}

const colors = {
  black: '#000000',
  gainsboro: '#dfdfdf',
  gray: '#7a7a7a',
  whisper: '#eeeeee',
  white: '#ffffff',
  zambezi: '#595959',
}

const theme = {
  colors,
}

export default theme
