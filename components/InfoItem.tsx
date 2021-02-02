import styled, { css, FlattenSimpleInterpolation } from 'styled-components'
import ContentLoader from 'styled-content-loader'

const Wrapper = styled.div<{ size: string }>(
  ({ size, theme: { colors } }): FlattenSimpleInterpolation => css`
    display: flex;

    h1 {
      color: ${colors.black};
      margin: 0;
      margin-bottom: 4px;
    }

    span {
      color: ${colors.zambezi};
      font-size: 0.9rem;
    }

    h1 {
      font-size: 0.9rem;
      font-weight: normal;

      ${size === 'md' &&
      css`
        font-size: 1rem;
      `};

      ${size === 'lg' &&
      css`
        font-family: 'Futura';
        font-size: 3rem;
      `};
    }
  `,
)

type Props = {
  title: string
  label: string
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Info = ({ title, label, size = 'md', isLoading = false }: Props) => {
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
