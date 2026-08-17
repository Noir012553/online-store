import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { AlertCircle, Loader2 } from "lucide-react";

interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

interface AddLanguageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLangCode: string;
  onSelectedLangCodeChange: (code: string) => void;
  availableLanguages: SupportedLanguage[];
  isProcessing: boolean;
  onConfirm: () => void;
}

export function AddLanguageModal({
  open,
  onOpenChange,
  selectedLangCode,
  onSelectedLangCodeChange,
  availableLanguages,
  isProcessing,
  onConfirm,
}: AddLanguageModalProps) {
  const { t } = useTranslation();

  const handleClose = () => {
    if (!isProcessing) {
      onOpenChange(false);
    }
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertCircle className="w-5 h-5" />
            {t('admin_add_language_confirm_title', 'admin-translation')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t('admin_add_language_confirm_desc', 'admin-translation')}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('admin_select_language_to_expand', 'admin-translation')}
            </label>
            <select
              value={selectedLangCode}
              onChange={(e) => onSelectedLangCodeChange(e.target.value)}
              disabled={isProcessing}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
            >
              <option value="">
                {t('admin_select_language_placeholder', 'admin-translation')}
              </option>
              {availableLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-xs text-gray-600">
              {t('admin_add_language_note', 'admin-translation')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            {t('admin_cancel', 'admin-translation')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || !selectedLangCode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
              isProcessing || !selectedLangCode
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            {isProcessing
              ? t('admin_processing', 'admin-translation')
              : t('admin_confirm_and_translate', 'admin-translation')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
