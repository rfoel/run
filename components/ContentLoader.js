import styled, { css, keyframes } from 'styled-components'

const animation = ([dark, light]) => keyframes`
  0% {
    background: ${dark};
  }
  50% {
    background: ${light};
  }
  100% {
    background: ${dark};
  }
`

const ContentLoader = styled.div(
  ({ isLoading, theme: { colors } }) => css`
    ${isLoading &&
    css`
      * {
        animation: ${() => animation(colors.loader)} 2s infinite ease-in-out;
        color: transparent !important;
        user-select: none;
        opacity: 0.25;
      }
    `}
  `,
)

export default ContentLoader
