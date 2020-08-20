import styled, { css } from 'styled-components'

const Text = styled.div(
  () => css`
    display: inline;
    font-family: 'Programme', sans-serif;
    -moz-font-feature-settings: 'pnum' on, 'lnum' on, 'ss04' on, 'ss03' on,
      'ss05' on, 'ss06' on, 'ss07' on, 'ss08' on, 'ss09' on, 'ss10' on,
      'ss11' on, 'ss12' on, 'ss13' on, 'ss20' on, 'ss14' on, 'ss15' on,
      'ss18' on, 'ss19' on;
    -webkit-font-feature-settings: 'pnum' on, 'lnum' on, 'ss04' on, 'ss03' on,
      'ss05' on, 'ss06' on, 'ss07' on, 'ss08' on, 'ss09' on, 'ss10' on,
      'ss11' on, 'ss12' on, 'ss13' on, 'ss20' on, 'ss14' on, 'ss15' on,
      'ss18' on, 'ss19' on;
    font-feature-settings: 'pnum' on, 'lnum' on, 'ss04' on, 'ss03' on, 'ss05' on,
      'ss06' on, 'ss07' on, 'ss08' on, 'ss09' on, 'ss10' on, 'ss11' on,
      'ss12' on, 'ss13' on, 'ss20' on, 'ss14' on, 'ss15' on, 'ss18' on,
      'ss19' on;
  `,
)

export default Text
