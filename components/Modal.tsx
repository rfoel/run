import styled, { css } from 'styled-components'

const Overlay = styled.div(
  ({ theme: { colors } }) => css`
    align-items: flex-end;
    background-color: rgba(0, 0, 0, 0.5);
    bottom: 0;
    cursor: default;
    display: flex;
    left: 0;
    position: fixed;
    right: 0;
    top: 0;
    z-index: 1;
  `,
)

const Content = styled.div(
  ({ theme: { colors } }) => css`
    background-color: ${colors.white};
    padding: 16px 24px;
    width: 100%;
  `,
)

const Modal = ({ children, isOpen, handleClose }) =>
  isOpen && (
    <Overlay onClick={handleClose}>
      <Content onClick={event => event.stopPropagation()}>{children}</Content>
    </Overlay>
  )

export default Modal
