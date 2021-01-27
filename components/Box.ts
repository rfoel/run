import styled from 'styled-components'
import {
  border,
  color,
  flexbox,
  layout,
  space,
  BorderProps,
  ColorProps,
  FlexboxProps,
  LayoutProps,
  SpaceProps,
} from 'styled-system'

const Box = styled.div<
  BorderProps & ColorProps & FlexboxProps & LayoutProps & SpaceProps
>(
  {
    boxSizing: 'border-box',
    minWidth: 0,
    width: '100%',
  },
  border,
  color,
  flexbox,
  layout,
  space,
)

export default Box
