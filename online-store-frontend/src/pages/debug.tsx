import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { BACKEND_URL } from '../config';

export const getServerSideProps = async () => {
  return { props: {} };
};

function DebugPage() {
  const { t } = useLanguage();
  const [headerInfo, setHeaderInfo] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeaders = async () => {
      try {
        const response = await fetch('/', { method: 'HEAD' });
        const headers: Record<string, string | null> = {
          'COOP': response.headers.get('Cross-Origin-Opener-Policy'),
          'CSP': response.headers.get('Content-Security-Policy')?.substring(0, 150) ?? null,
          'Server': response.headers.get('Server'),
        };
        setHeaderInfo(headers);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchHeaders();
  }, []);

  const isCloudflare = typeof window !== 'undefined'
    ? window.location.hostname.includes('manln.online')
    : false;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{t('debug_title', 'pages')}</h1>

      {/* Environment Info */}
      <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">{t('debug_environment', 'pages')}</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-2 font-semibold">{t('debug_current_url', 'pages')}</td>
              <td className="py-2 font-mono">{typeof window !== 'undefined' ? window.location.href : t('debug_not_available', 'pages')}</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">{t('debug_origin', 'pages')}</td>
              <td className="py-2 font-mono">{typeof window !== 'undefined' ? window.location.origin : t('debug_not_available', 'pages')}</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">{t('debug_cloudflare', 'pages')}</td>
              <td className="py-2">
                <span className={isCloudflare ? 'text-orange-600 font-bold' : 'text-green-600'}>
                  {isCloudflare ? t('debug_cloudflare_yes', 'pages') : t('debug_cloudflare_no', 'pages')}
                </span>
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">{t('debug_node_env', 'pages')}</td>
              <td className="py-2 font-mono">{process.env.NODE_ENV}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Server Response Headers */}
      <div className="mb-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">{t('debug_headers', 'pages')}</h2>
        {loading ? (
          <p className="text-gray-500">{t('debug_loading', 'pages')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(headerInfo).map(([key, value]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 font-semibold w-32">{key}:</td>
                  <td className="py-2 font-mono break-words">
                    {value || <span className="text-red-500">{t('debug_not_set', 'pages')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Backend API Config */}
      <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">{t('debug_backend_config', 'pages')}</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-2 font-semibold">{t('debug_api_url', 'pages')}</td>
              <td className="py-2 font-mono">{BACKEND_URL}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Troubleshooting */}
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">{t('debug_troubleshooting', 'pages')}</h2>
        <ol className="list-decimal ml-6 space-y-2 text-sm">
          <li>
            <strong>{t('debug_cloudflare_note', 'pages')}</strong>
            <ul className="ml-6 mt-1 list-disc">
              <li>{t('debug_check_headers', 'pages')}</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(DebugPage), { ssr: false });
