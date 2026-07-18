import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { X } from "lucide-react";

type TimeFrame = 'day' | 'month' | 'quarter' | 'year';

interface DateSelection {
  type: TimeFrame;
  start?: Date;
  end?: Date;
  startMonth?: number;
  startYear?: number;
  endMonth?: number;
  endYear?: number;
  startQuarter?: number;
  endQuarter?: number;
}

interface DateRangePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: DateSelection | null;
  onSelectionChange: (selection: DateSelection) => void;
  onApply: () => void;
}

const dateToISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function DateRangePickerModal({
  open,
  onOpenChange,
  selection,
  onSelectionChange,
  onApply,
}: DateRangePickerModalProps) {
  const { t } = useTranslation();

  if (!selection) return null;

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleApply = () => {
    onApply();
    handleClose();
  };

  const getTitle = () => {
    switch (selection.type) {
      case 'day':
        return t('period_day');
      case 'month':
        return t('period_month');
      case 'quarter':
        return t('period_quarter');
      case 'year':
        return t('period_year');
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {selection.type === 'day' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_from')}
                </label>
                <input
                  type="date"
                  value={selection.start ? dateToISOString(selection.start) : ''}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    onSelectionChange({
                      ...selection,
                      start: new Date(y, m - 1, d),
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_from')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_to')}
                </label>
                <input
                  type="date"
                  value={selection.end ? dateToISOString(selection.end) : ''}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    onSelectionChange({
                      ...selection,
                      end: new Date(y, m - 1, d),
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_to')}
                />
              </div>
            </>
          )}

          {selection.type === 'month' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_from')}
                </label>
                <select
                  value={selection.startMonth || 0}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      startMonth: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_from')}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {t('period_month')} {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('period_year')}
                </label>
                <input
                  type="number"
                  value={selection.startYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      startYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('period_year')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_to')}
                </label>
                <select
                  value={selection.endMonth || 0}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      endMonth: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_to')}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {t('period_month')} {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('period_year')}
                </label>
                <input
                  type="number"
                  value={selection.endYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      endYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('period_year')}
                />
              </div>
            </div>
          )}

          {selection.type === 'quarter' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_from')}
                </label>
                <select
                  value={selection.startQuarter || 1}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      startQuarter: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_from')}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      {t('period_quarter')} {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('period_year')}
                </label>
                <input
                  type="number"
                  value={selection.startYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      startYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('period_year')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_to')}
                </label>
                <select
                  value={selection.endQuarter || 4}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      endQuarter: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_to')}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      {t('period_quarter')} {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('period_year')}
                </label>
                <input
                  type="number"
                  value={selection.endYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      endYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('period_year')}
                />
              </div>
            </div>
          )}

          {selection.type === 'year' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_from')}
                </label>
                <input
                  type="number"
                  value={selection.startYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      startYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_from')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date_to')}
                </label>
                <input
                  type="number"
                  value={selection.endYear || new Date().getFullYear()}
                  onChange={(e) =>
                    onSelectionChange({
                      ...selection,
                      endYear: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={t('date_to')}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            {t('apply')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
