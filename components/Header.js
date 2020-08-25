import styled, { css } from 'styled-components'
import useSWR from 'swr'

import ContentLoader from './ContentLoader'
import MutedText from './MutedText'
import Text from './Text'

const StyledHeader = styled(ContentLoader)(
  () => css`
    align-items: center;
    display: flex;
    flex-direction: column;
    height: 156px;
    justify-content: center;

    ${Text} {
      font-size: 56px;
      line-height: 56px;
    }

    ${MutedText} {
      font-size: 16px;
      line-height: 16px;
    }
  `,
)

const Header = () => {
  const { data: totalDistance, error } = useSWR('/api/total-distance')

  return (
    <StyledHeader isLoading={!totalDistance || error}>
      <Text>{(totalDistance / 1000).toFixed(2)} km</Text>
      <MutedText>Total kilometers</MutedText>
    </StyledHeader>
  )
}

export default Header
