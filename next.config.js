module.exports = {
  env: {
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  },
  async rewrites() {
    return [
      {
        source: '/bee.js',
        destination: 'https://cdn.splitbee.io/sb.js',
      },
      {
        source: '/_hive/:slug',
        destination: 'https://hive.splitbee.io/:slug',
      },
    ]
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      issuer: {
        test: /\.(ts)x?$/,
      },
      use: ['@svgr/webpack'],
    })

    return config
  },
}
