import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="vi">
      <Head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Block Cloudflare Analytics beacon
              if (window.navigator && window.navigator.sendBeacon) {
                const originalSendBeacon = window.navigator.sendBeacon;
                window.navigator.sendBeacon = function(url, data) {
                  if (url && url.includes('cloudflareinsights')) {
                    return true; // Pretend it was sent to avoid errors
                  }
                  return originalSendBeacon.call(window.navigator, url, data);
                };
              }
              
              // Block fetch requests to Cloudflare insights
              const originalFetch = window.fetch;
              window.fetch = function(...args) {
                const url = args[0];
                if (typeof url === 'string' && url.includes('cloudflareinsights')) {
                  console.log('[Security] Blocked Cloudflare fetch request:', url);
                  return Promise.reject(new Error('Blocked by CSP'));
                }
                return originalFetch.apply(this, args);
              };
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
