import { Html, Head, Main, NextScript } from 'next/document';
import Document from 'next/document';
import { DEFAULT_LOCALE } from '../lib/i18n/types';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang={this.props.locale || DEFAULT_LOCALE} suppressHydrationWarning>
        <Head />
        <body suppressHydrationWarning>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
