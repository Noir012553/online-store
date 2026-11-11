import { useLanguage } from '../lib/i18n';

function Error({ statusCode }: { statusCode: number }) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-5 text-center">
      <h1 className="m-0 mb-2.5 text-5xl font-bold">
        {statusCode || 500}
      </h1>
      <p className="m-0 text-lg text-muted-foreground">
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
