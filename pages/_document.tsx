import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document'
import { ServerStyleSheet } from 'styled-components'

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<any> {
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
          <link
            as="font"
            crossOrigin="anonymous"
            href="futura_condensed_extra_bold_italic-webfont.ttf"
            rel="preload"
            type="font/ttf"
          />
          <link
            as="font"
            crossOrigin="anonymous"
            href="futura_condensed_extra_bold_italic-webfont.woff"
            rel="preload"
            type="font/woff"
          />
          <link
            as="font"
            crossOrigin="anonymous"
            href="futura_condensed_extra_bold_italic-webfont.woff2"
            rel="preload"
            type="font/woff2"
          />
          <link as="style" href="/fonts.css" rel="stylesheet preload " />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
