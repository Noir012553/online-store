import { useLanguage } from '../lib/i18n';

function Error({ statusCode }: { statusCode: number }) {
  const { t } = useLanguage();

  return (
    <div style={{ padding: '20px', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
        {statusCode || 500}
      </h1>
      <p style={{ fontSize: '18px', color: '#666', margin: 0 }}>
        {statusCode === 404 ? t('error_page_not_found', 'errors') : t('error_server_error', 'errors')}
      </p>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: { res: any; err: any }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
