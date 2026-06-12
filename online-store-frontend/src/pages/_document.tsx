import { Html, Head, Main, NextScript } from 'next/document';
import Document from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="vi" suppressHydrationWarning>
        <Head />
        <body suppressHydrationWarning>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
