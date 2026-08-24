import React from 'react';
import { useLanguage } from '../lib/i18n';

interface SpecsTableProps {
  specs: Record<string, any>;
  specLabels?: Record<string, string>;
}

export const SpecsTable: React.FC<SpecsTableProps> = ({ specs, specLabels = {} }) => {
  const { t } = useLanguage();
  const specEntries = specs ? Object.entries(specs) : [];

  if (specEntries.length === 0) {
    return <p className="py-8 text-center text-gray-500">{t('no_specs', 'products')}</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <tbody>
          {specEntries.map(([key, value], idx) => (
            <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-white/30"}>
              <td className="px-4 py-3 font-medium text-gray-600 w-1/3 border-b border-gray-50">
                {specLabels[key] || key}
              </td>
              <td className="px-4 py-3 text-gray-900 border-b border-gray-50">
                {String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
