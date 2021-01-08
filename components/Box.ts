import styled from 'styled-components'
import {
  color,
  flexbox,
  layout,
  space,
  ColorProps,
  FlexboxProps,
  LayoutProps,
  SpaceProps,
} from 'styled-system'

const Box = styled.div<ColorProps & FlexboxProps & LayoutProps & SpaceProps>(
  {
    boxSizing: 'border-box',
    minWidth: 0,
    width: '100%',
  },
  color,
  space,
  layout,
  flexbox,
)

export default Box
