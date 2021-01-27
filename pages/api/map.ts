import { NextApiRequest, NextApiResponse } from 'next'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { polyline }: { polyline: string } = req.query

    const map = await fetch(
      `https://api.mapbox.com/styles/v1/rfoel/ckk33or0z1ghj17n3ixrq0ifb/static/path-1+000000(${polyline})/auto/70x70?access_token=${process.env.MAPBOX_TOKEN}`,
    )
      .then(response => response.buffer())
      .then(buffer => buffer.toString('base64'))

    return res.json({ map })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
