import { createGlobalStyle } from 'styled-components'

const GlobalStyles = createGlobalStyle`
  html,
  body,
  #__next {
    align-items: center;
    display: flex;
    font-size: 16px;
    justify-content: center;
    margin: 0;
    min-height: 100%;
    padding: 0;
    width: 100%;
  }

  body {
    font-family: BlinkMacSystemFont, -apple-system, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Helvetica,
      Arial, sans-serif;
  }
`

export default GlobalStyles
