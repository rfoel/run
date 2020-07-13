import React from 'react'
import { node } from 'prop-types'
import styled, { css } from 'styled-components'

const Container = styled.div(
  ({
    theme: {
      colors: { primary },
    },
  }) =>
    css`
      background-color: ${primary.base};
      color: ${primary.contrast};
      height: 100%;
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
