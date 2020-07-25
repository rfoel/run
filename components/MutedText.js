import styled, { css } from 'styled-components'

import Text from './Text'

export default styled(Text)(
  ({ theme: { colors } }) => css`
    color: ${colors.muted};
  `,
)
