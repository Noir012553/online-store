import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation, useLanguage } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { productAPI, categoryAPI } from '../../lib/api';
import { toast } from 'sonner';
import { getCategoryName } from '../../lib/data';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function ExportProductsContent() {
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const [exportStats, setExportStats] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv'>('json');

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrentRequest = true;

    const fetchData = async () => {
      setIsLoading(true);
      const [statsResult, categoriesResult] = await Promise.allSettled([
        productAPI.getExportStats(locale, {
          signal: controller.signal,
          skipErrorToast: true,
        }),
        categoryAPI.getCategories(locale, {
          signal: controller.signal,
          skipErrorToast: true,
        }, true),
      ]);

      if (!isCurrentRequest) return;

      if (statsResult.status === 'fulfilled') {
        setExportStats(statsResult.value);
      } else if (!controller.signal.aborted) {
        toast.error(t('error_load_data', 'admin'));
      }

      if (categoriesResult.status === 'fulfilled') {
        const categoriesList = categoriesResult.value.categories || categoriesResult.value;
        setCategories(Array.isArray(categoriesList) ? categoriesList : []);
      } else if (statsResult.status === 'fulfilled') {
        setCategories(Array.isArray(statsResult.value.categories) ? statsResult.value.categories : []);
      } else {
        setCategories([]);
      }

      setIsLoading(false);
    };

    fetchData();

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [locale]);

  const getCategoryDisplayName = (catObj: any, locale: string) => {
    try {
      return getCategoryName(catObj);
    } catch {
      return catObj?.name || catObj?.category || t('unknown_label', 'common');
    }
  };


  const handleExport = async () => {
    try {
      setIsExporting(true);
      const blob = await productAPI.exportProductBundleAsync(
        selectedCategory,
        undefined,
        undefined,
        locale,
        selectedFormat,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products-export-${Date.now()}.zip`;
      link.className = 'sr-only';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t('export_zip_success', 'admin', 'Đã xuất ZIP chứa products.json có thể nhập lại'));
    } catch (error) {
      toast.error(t('error_exporting_file'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
          <Download className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t('export_products')}</h1>
          <p className="text-gray-600 mt-1">{t('export_products_desc')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg border p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow">
          <div className="space-y-4">
            {exportStats && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-900 mb-2">{t('stats_label')}</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-green-800">
                  <div>{t('total_label')} <span className="font-bold">{exportStats.totalProducts}</span></div>
                  <div>{t('categories_label')} <span className="font-bold">{exportStats.categories.length}</span></div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('category_optional')}</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="all">{t('all_categories')}</option>
                  {categories?.map((cat: any) => {
                    const categoryId = cat._id || cat.id || cat.categoryId;
                  const categoryStats = exportStats?.categories?.find(
                    (stat: any) => String(stat.categoryId) === String(categoryId),
                  );
                  const catDisplayName = getCategoryDisplayName(cat, locale);
                  return (
                    <option key={categoryId} value={categoryId}>
                      {catDisplayName}{categoryStats ? ` (${categoryStats.count})` : ''}
                    </option>
                  );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('format_label', 'export')}</label>
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as 'json' | 'csv')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="json">{t('format_json_extension', 'export')}</option>
                  <option value="csv">{t('format_csv_extension', 'export')}</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {isExporting
                ? t('exporting')
                : t('export_products')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAdminLayout(ExportProductsContent, {
  permission: 'admin',
  featureName: 'Export Products'
});
