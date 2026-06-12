import React from 'react';
import { useTranslation } from '../lib/i18n';

interface SpecsTableProps {
  specs: Record<string, any>;
}

export const SpecsTable: React.FC<SpecsTableProps> = ({ specs }) => {
  if (!specs || Object.keys(specs).length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(specs).map(([key, value], idx) => (
            <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-white/30"}>
              <td className="px-4 py-3 font-medium text-gray-600 w-1/3 border-b border-gray-50 capitalize">
                {key}
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
