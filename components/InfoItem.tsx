import { FunctionComponent } from 'react'
import styled, { css } from 'styled-components'
import ContentLoader from 'styled-content-loader'

const Wrapper = styled.div(
  ({ size, theme: { colors } }) => css`
    display: flex;

    h1 {
      color: ${colors.black};
      font-size: 1rem;
      margin: 0;

      ${size === 'large' &&
      css`
        font-family: 'Futura';
        font-size: 3rem;
      `};
    }

    span {
      color: ${colors.gray};
    }
  `,
)

type Props = {
  title: string
  label: string
  size?: 'small' | 'large'
  isLoading?: boolean
}

const Info: FunctionComponent = ({
  title,
  label,
  size = 'small',
  isLoading = false,
}: Props) => {
  return (
    <Wrapper size={size}>
      <ContentLoader isLoading={isLoading}>
        <h1>{title}</h1>
        <span>{label}</span>
      </ContentLoader>
    </Wrapper>
  )
}

export default Info
