import React from 'react'
import { bool, func } from 'prop-types'
import styled, { css } from 'styled-components'

const Input = styled.input`
  cursor: inherit;
  height: 100%;
  opacity: 0;
  position: absolute;
  width: 100%;
`

const Track = styled.label`
  align-items: center;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  position: relative;
  ${({ checked }) =>
    css`
      background-color: ${checked ? '#ffffff' : '#000000'};
      border-radius: 9999px;
      height: 24px;
      transition-property: background-color;
      transition-duration: 300ms;
      width: 36px;
    `};
`

const Thumb = styled.span(
  ({ checked }) => css`
    background-color: #ffffff;
    border-radius: 9999px;
    left: 4px;
    height: 16px;
    pointer-events: none;
    position: relative;
    transition-property: left, transform;
    transition-duration: 200ms;
    transition-timing-function: ease;
    width: 16px;

    ${checked &&
    css`
      background-color: #ffffff;
      box-shadow: inset -5px 0 0 0 #000000;
      left: calc(100% - 4px);
      transform: translateX(-100%);
    `}
  `,
)

const Switch = ({ checked, onChange }) => (
  <Track checked={checked}>
    <Input
      aria-hidden
      aria-checked={checked}
      onChange={onChange}
      role="switch"
      type="checkbox"
    />
    <Thumb aria-label="Switch Thumb" checked={checked} role="button" />
  </Track>
)

Switch.propTypes = {
  checked: bool,
  onChange: func,
}

Switch.defaultProps = {
  checked: false,
  onChange: () => {},
}

export default Switch
