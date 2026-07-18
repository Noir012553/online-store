import { useEffect } from 'react';
import { useTranslation } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import ImportExportWidget from '../../components/admin/ImportExportWidget';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function ImportExportContent() {
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-3">{t('import_export_title')}</h1>
      <p className="text-gray-600 mb-8">{t('import_products_desc')}</p>
      <ImportExportWidget />
    </div>
  );
}

export default withAdminLayout(ImportExportContent, {
  permission: 'admin',
  featureName: 'Import/Export',
});
