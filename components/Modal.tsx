import { ReactElement } from 'react'
import styled, { css } from 'styled-components'

const Overlay = styled.div`
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
`

const Content = styled.div(
  ({ theme: { colors } }): any => css`
    background-color: ${colors.white};
    padding: 16px 24px;
    width: 100%;
  `,
)

type Props = {
  children: JSX.Element | JSX.Element[]
  isOpen: boolean
  handleClose: (event?: Event) => void
}

const Modal = ({ children, isOpen, handleClose }: Props): ReactElement | null =>
  isOpen ? (
    <Overlay onClick={(): void => handleClose()}>
      <Content onClick={(event): void => event.stopPropagation()}>
        {children}
      </Content>
    </Overlay>
  ) : null

export default Modal
