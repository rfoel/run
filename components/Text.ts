import styled from 'styled-components'
import {
  color,
  typography,
  space,
  ColorProps,
  SpaceProps,
  TypographyProps,
} from 'styled-system'

const Text = styled.div<ColorProps  & SpaceProps & TypographyProps>(
  color,
  space,
  typography,
)

export default Text
