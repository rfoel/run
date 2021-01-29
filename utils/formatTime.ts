const formatTime = (time: number): string => {
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60) % 60
  const seconds = time % 60

  return [hours, minutes, seconds]
    .map(v => (v < 10 ? '0' + v : v))
    .filter((v, i) => v !== '00' || i > 0)
    .join(':')
}

export default formatTime
