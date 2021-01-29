const fetcher = (url: string): Promise<Response> =>
  fetch(url).then((res): Promise<any> => res.json())

export default fetcher
