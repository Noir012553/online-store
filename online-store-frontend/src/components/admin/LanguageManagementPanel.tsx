import { useState } from 'react';
import { Loader2, Plus, Trash2, Check } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { AVAILABLE_LOCALES, SUPPORTED_LOCALES, useLanguage, type Locale } from '../../lib/i18n';

interface LanguageStatus {
  lang: Locale;
  active: boolean;
  syncStatus: 'idle' | 'syncing' | 'done' | 'error';
}

export function LanguageManagementPanel() {
  const { t } = useLanguage();
  const [languages, setLanguages] = useState<LanguageStatus[]>(
    SUPPORTED_LOCALES.map((lang) => ({
      lang,
      active: true,
      syncStatus: 'idle',
    }))
  );
  const [selectedLang, setSelectedLang] = useState<Locale | ''>('');
  const [isLoading, setIsLoading] = useState(false);

  const availableLangs = (Object.keys(AVAILABLE_LOCALES) as Locale[]).filter(
    (lang) => !languages.some((l) => l.lang === lang)
  );

  const handleAddLanguage = async () => {
    if (!selectedLang) return;

    const newLang: LanguageStatus = {
      lang: selectedLang,
      active: false,
      syncStatus: 'syncing',
    };

    setLanguages((prev) => [...prev, newLang]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/translations/activate-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: selectedLang }),
      });

      if (!response.ok) throw new Error(t('admin_language_management_activate_error', 'admin'));

      setLanguages((prev) =>
        prev.map((l) =>
          l.lang === selectedLang
            ? { ...l, active: true, syncStatus: 'done' }
            : l
        )
      );
      setSelectedLang('');
    } catch (error) {
      setLanguages((prev) =>
        prev.map((l) =>
          l.lang === selectedLang
            ? { ...l, syncStatus: 'error' }
            : l
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveLanguage = async (lang: Locale) => {
    if (languages.length === 1) {
      alert(t('language_management_at_least_one', 'admin'));
      return;
    }

    setLanguages((prev) =>
      prev.map((l) => (l.lang === lang ? { ...l, syncStatus: 'syncing' } : l))
    );

    try {
      const response = await fetch('/api/admin/translations/deactivate-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });

      if (!response.ok) throw new Error(t('admin_language_management_deactivate_error', 'admin'));

      setLanguages((prev) => prev.filter((l) => l.lang !== lang));
    } catch (error) {
      setLanguages((prev) =>
        prev.map((l) => (l.lang === lang ? { ...l, syncStatus: 'error' } : l))
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('language_management_active_languages', 'admin')}</h3>
        <div className="space-y-3">
          {languages.map((lang) => (
            <div
              key={lang.lang}
              className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{AVAILABLE_LOCALES[lang.lang].flag}</span>
                <div>
                  <p className="font-medium">{AVAILABLE_LOCALES[lang.lang].label}</p>
                  <p className="text-sm text-gray-600">{lang.lang.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lang.syncStatus === 'syncing' && (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                )}
                {lang.syncStatus === 'done' && (
                  <Check className="w-5 h-5 text-green-600" />
                )}
                {lang.syncStatus === 'error' && (
                  <span className="text-xs text-red-600">{t('language_management_error_badge', 'admin')}</span>
                )}
                {lang.active && languages.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveLanguage(lang.lang)}
                    disabled={isLoading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {availableLangs.length > 0 && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">{t('language_management_add_language', 'admin')}</h3>
          <div className="flex gap-2">
            <Select value={selectedLang} onValueChange={(value) => setSelectedLang(value as Locale)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t('language_management_select_placeholder', 'admin')} />
              </SelectTrigger>
              <SelectContent>
                {availableLangs.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    <span className="mr-2">{AVAILABLE_LOCALES[lang].flag}</span>
                    {AVAILABLE_LOCALES[lang].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddLanguage}
              disabled={!selectedLang || isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('language_management_activate_button', 'admin')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
