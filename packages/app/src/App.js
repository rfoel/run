import React, { useEffect, useState } from 'react'

import { getRunCount } from './utils'

const App = () => {
  const [count, setCount] = useState(null)

  useEffect(() => {
    getRunCount().then(setCount)
  }, [count])

  if (!count) return '🏃'

  return <div>I ran {count} days in a row</div>
}
export default App
