import useSWR from 'swr'
import styled, { css } from 'styled-components'
import ContentLoader from 'styled-content-loader'

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
      margin-bottom: 8px;
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
    <StyledHeader isLoading={Boolean(!totalDistance || error)}>
      <Text>{(totalDistance / 1000).toFixed(2)} km</Text>
      <MutedText>Total kilometers</MutedText>
    </StyledHeader>
  )
}

export default Header