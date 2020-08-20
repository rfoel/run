import styled, { css } from 'styled-components'

import Text from './Text'

const MutedText = styled(Text)(
  ({ theme: { colors } }) => css`
    color: ${colors.muted};
  `,
)

export default MutedText
