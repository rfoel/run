import { FunctionComponent } from 'react'

import Box from './Box'

const Container: FunctionComponent = ({ children }) => (
  <Box margin="0 auto" maxWidth="360px">
    {children}
  </Box>
)

export default Container
