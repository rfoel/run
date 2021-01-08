import { useEffect } from 'react'
import dayjs from 'dayjs'

import SelectorLabel from './SelectorLabel'
import useGlobalState from '../hooks/useGlobalState'
import { DATE_FORMAT } from '../utils/constants'

const YearSelector = () => {
  const [state, setState] = useGlobalState()

  const maxYear = Math.max(...state.years)
  const minYear = Math.min(...state.years)

  useEffect(() => {
    setState({
      range: {
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

export default YearSelector
