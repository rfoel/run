import { useEffect, useState } from 'react'

const useIsBottomOfThePage = () => {
  const [isBottom, setIsBottom] = useState(false)

  const handleScroll = () =>
    setIsBottom(
      window.innerHeight + document.documentElement.scrollTop ===
        document.documentElement.offsetHeight,
    )

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return isBottom
}

export default useIsBottomOfThePage
