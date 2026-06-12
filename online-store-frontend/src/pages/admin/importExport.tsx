import { useEffect } from 'react';
import { useTranslation } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
import ImportExportWidget from '../../components/admin/ImportExportWidget';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function ImportExport() {
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-3">{t('import_export_title', 'admin')}</h1>
        <p className="text-gray-600 mb-8">{t('import_products_desc', 'export')}</p>
        <ImportExportWidget />
      </div>
    </AdminLayout>
  );
}
