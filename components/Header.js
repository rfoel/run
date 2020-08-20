import styled from 'styled-components'
import useSWR from 'swr'

import Error from '../components/Error'
import MutedText from './MutedText'
import Text from './Text'

const StyledHeader = styled.header`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 156px;
  justify-content: center;

  ${Text} {
    font-size: 56px;
  }

  ${MutedText} {
    font-size: 16px;
  }
`

const Header = () => {
  const { data: { totalDistance } = {}, error } = useSWR('/api/total-distance')

  if (error) return <Error />
  if (!totalDistance) return null

  return (
    <StyledHeader>
      <Text>{(totalDistance / 1000).toFixed(2)} km</Text>
      <MutedText>Total kilometers</MutedText>
    </StyledHeader>
  )
}

export default Header
