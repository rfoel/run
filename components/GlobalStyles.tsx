import { createGlobalStyle } from 'styled-components'

const GlobalStyles = createGlobalStyle`
  html,
  body,
  #__next {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    font-size: 16px;
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
