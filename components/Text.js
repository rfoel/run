import styled, { css } from 'styled-components'

const Text = styled.div(
  () => css`
    display: inline;
    font-family: 'TT Firs Neue', -apple-system, system-ui, 'Segoe UI', Roboto,
      Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    font-weight: 600;
  `,
)

export default Text
