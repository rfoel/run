import React from 'react'
import { node } from 'prop-types'
import styled, { css } from 'styled-components'

const Container = styled.div(
  ({ theme: { colors } }) =>
    css`
      background-color: ${colors.base};
      color: ${colors.contrast};
      height: 100%;
      transition-property: all;
      transition-duration: 200ms;
      transition-timing-function: ease;
      width: 100%;
    `,
)

function Page({ children }) {
  return <Container>{children}</Container>
}

Page.propTypes = {
  children: node.isRequired,
}

export default Page
