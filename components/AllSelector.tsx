import dayjs from 'dayjs'
import { ReactElement, useEffect } from 'react'

import useGlobalState from '../hooks/useGlobalState'
import { DATE_FORMAT } from '../utils/constants'

import SelectorLabel from './SelectorLabel'

const AllSelector = (): ReactElement | null => {
  const [state, setState] = useGlobalState()

  if (!state.years) {
    return null
  }

  const maxYear = Math.max(...state.years)
  const minYear = Math.min(...state.years)

  useEffect((): void => {
    setState({
      range: {
        label: `${minYear} - ${maxYear}`,
        value: {
          start: dayjs().year(minYear).startOf('year').format(DATE_FORMAT),
          end: dayjs().year(maxYear).endOf('year').format(DATE_FORMAT),
        },
      },
    })
  }, [])

  return (
    <SelectorLabel withIcon={false}>
      {minYear} - {maxYear}
    </SelectorLabel>
  )
}

export default AllSelector
