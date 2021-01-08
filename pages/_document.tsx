import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from 'next/document'
import { ServerStyleSheet } from 'styled-components'

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const sheet = new ServerStyleSheet()
    const originalRenderPage = ctx.renderPage

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: App => props => sheet.collectStyles(<App {...props} />),
        })

      const initialProps = await Document.getInitialProps(ctx)
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      }
    } finally {
      sheet.seal()
    }
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          {process.env.NODE_ENV === 'production' && (
            <script async data-api="/_hive" src="/bee.js"></script>
          )}
          <link rel="stylesheet" href="/fonts.css" />
          <link
            rel="preload"
            href="/futura_condensed_extra_bold_italic-webfont.woff"
            as="font"
            type="font/woff"
          />
          <link
            rel="preload"
            href="/futura_condensed_extra_bold_italic-webfont.woff2"
            as="font"
            type="font/woff2"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
