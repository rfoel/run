import styled, { css } from 'styled-components'
import { up, down } from 'styled-breakpoints'

export const Grid = styled.div(
  ({
    theme: {
      grid: { breakpoints, width },
    },
  }) => css`
    margin-right: auto;
    margin-left: auto;
    width: 100%;

    ${breakpoints.map(
      breakpoint => css`
        ${up(breakpoint)} {
          max-width: ${width[breakpoint]};
        }
      `,
    )}
  `,
)

export const Row = styled.div(
  ({
    align,
    justify,
    theme: {
      grid: { breakpoints, gutter },
    },
  }) => css`
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;

    ${breakpoints.map(
      breakpoint => css`
        ${up(breakpoint)} {
          margin-left: -${gutter[breakpoint] / 2}px;
          margin-right: -${gutter[breakpoint] / 2}px;
        }
      `,
    )}

    ${
      align &&
      css`
        align-items: ${align};
      `
    }

    ${
      justify &&
      css`
        justify-content: ${justify};
      `
    }
  `,
)

export const Column = styled.div(
  ({
    align,
    justify,
    theme: {
      grid: { breakpoints, columns, gutter },
    },
    ...props
  }) => css`
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;

    ${breakpoints.map(
      breakpoint =>
        props[breakpoint] &&
        css`
          ${down(breakpoint)} {
            flex: 1 1 ${(props[breakpoint] / columns[breakpoint]) * 100}%;
            max-width: ${(props[breakpoint] / columns[breakpoint]) * 100}%;
          }
        `,
    )}

    ${breakpoints.map(
      breakpoint => css`
        ${up(breakpoint)} {
          padding-left: ${gutter[breakpoint] / 2}px;
          padding-right: ${gutter[breakpoint] / 2}px;
        }
      `,
    )}

    ${
      align &&
      css`
        align-items: ${align};
      `
    }

    ${
      justify &&
      css`
        justify-content: ${justify};
      `
    }
  `,
)
