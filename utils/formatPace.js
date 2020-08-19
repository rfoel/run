const formatPace = pace => {
  const minutes = Math.trunc(pace)
  const seconds = (((pace % 1) * 60) / 100).toFixed(2).substring(2)
  return `${minutes}'${seconds}"`
}

export default formatPace
