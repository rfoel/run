import { getWeeks } from './period'

const initialState = {
  period: 'week',
  range: getWeeks()[0],
  years: [],
  streaks: [],
}

export default initialState
