import React from 'react';
import { useLanguage } from '../lib/i18n';
const SPEC_LABEL_KEYS: Record<string, string> = {
  chatlieuvo: 'spec_case_material',
  casematerial: 'spec_case_material',
};

const normalizeSpecLabel = (value: string): string => (
  value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '')
);

interface SpecsTableProps {
  specs: Record<string, any>;
  specLabels?: Record<string, string>;
}

export const SpecsTable: React.FC<SpecsTableProps> = ({ specs, specLabels = {} }) => {
  const { t } = useLanguage();
  const specEntries = specs ? Object.entries(specs) : [];
  const getSpecLabel = (key: string): string => {
    const sourceLabel = specLabels[key] || key;
    const translationKey = SPEC_LABEL_KEYS[normalizeSpecLabel(sourceLabel)];
    return translationKey
      ? t(translationKey, 'products')
      : sourceLabel;
  };

  if (specEntries.length === 0) {
    return <p className="py-8 text-center text-gray-500">{t('no_specs', 'products')}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <tbody>
          {specEntries.map(([key, value], idx) => (
            <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
              <td className="w-1/3 border-b border-slate-100 px-3 py-3 font-semibold text-slate-500 sm:px-4">
                {getSpecLabel(key)}
              </td>
              <td className="space-y-0.5 border-b border-slate-100 px-3 py-3 leading-5 text-slate-900 sm:px-4">
                {String(value).split(';').map((item, index) => (
                  <span key={`${item}-${index}`} className="block">
                    {item.trim()}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
