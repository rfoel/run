import styled, { css } from 'styled-components'

const Button = styled.button(
  ({ theme: { colors } }) => css`
    background-color: ${colors.black};
    border: none;
    border-radius: 9999px;
    color: ${colors.white};
    font-size: 1rem;
    padding: 16px 24px;
    outline: none;
    width: 100%;
  `,
)

export default Button
