import { useState, useEffect } from 'react';
import { FileUp, FileDown, Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { productAPI, categoryAPI } from '../../lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/i18n';
import { getCategoryName } from '../../lib/data';

export default function ImportExportWidget() {
  const { t, locale } = useLanguage();
  const [exportStats, setExportStats] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv'>('json');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [locale]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([fetchExportStats(), fetchCategories()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExportStats = async () => {
    try {
      const stats = await productAPI.getExportStats(locale);
      setExportStats(stats);
    } catch (error) {
      toast.error(t('error_loading_export_data', 'export'));
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoryAPI.getCategories(locale);
      const categoriesList = response.categories || response;
      setCategories(Array.isArray(categoriesList) ? categoriesList : []);
    } catch (error) {
      // Failed to fetch categories
    }
  };


  const handleExport = async () => {
    try {
      setIsExporting(true);
      const data = await productAPI.exportProducts(selectedFormat, selectedCategory, undefined, undefined, locale);

      if (selectedFormat === 'csv') {
        // Handle CSV export
        const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `products-${Date.now()}.csv`);
        link.className = 'sr-only';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Handle JSON export
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `products-${Date.now()}.json`);
        link.className = 'sr-only';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      toast.success(t('success_export', 'export').replace('{{format}}', selectedFormat.toUpperCase()));
    } catch (error) {
      toast.error(t('error_exporting_file', 'export'));
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Import Card */}
      <div className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t('import_products', 'export')}</h3>
            <p className="text-sm text-gray-600">{t('import_products_desc', 'export')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              {t('import_products_note', 'export')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-700">{t('features_label', 'export')}</p>
            <ul className="text-sm space-y-1 text-gray-600 list-disc list-inside">
              <li>{t('feature_import_json_csv', 'export')}</li>
              <li>{t('feature_import_modes', 'export')}</li>
              <li>{t('feature_import_dry_run', 'export')}</li>
              <li>{t('feature_import_error_details', 'export')}</li>
            </ul>
          </div>

          <Link href="/admin/importProducts" className="block">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
              {t('go_to_import_page', 'export')}
            </button>
          </Link>
        </div>
      </div>

      {/* Export Card */}
      <div className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
            <Download className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t('export_products', 'export')}</h3>
            <p className="text-sm text-gray-600">{t('export_products_desc', 'export')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {exportStats && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-900 mb-2">{t('stats_label', 'export')}</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-green-800">
                <div>{t('total_label', 'export')} <span className="font-bold">{exportStats.totalProducts}</span></div>
                <div>{t('categories_label', 'export')} <span className="font-bold">{exportStats.categories?.length || 0}</span></div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('format_label', 'export')}</label>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as 'json' | 'csv')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="json">{t('format_json', 'export')}</option>
                <option value="csv">{t('format_csv', 'export')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('category_optional', 'export')}</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="all">{t('all_categories', 'export')}</option>
                {categories?.map((cat: any) => {
                  const catDisplayName = getCategoryName(cat);
                  const catStats = exportStats?.categories?.find((s: any) => s.category === catDisplayName);
                  return (
                    <option key={cat._id || cat.id} value={cat._id || cat.id}>
                      {catDisplayName} ({catStats?.count || 0})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {isExporting ? t('exporting', 'export') : t('export_btn', 'export')}
          </button>
        </div>
      </div>
    </div>
  );
}
