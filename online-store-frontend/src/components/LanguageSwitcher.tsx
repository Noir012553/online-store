import { Globe, Loader2 } from 'lucide-react';
import { useLanguage, type Locale } from '../lib/i18n';
import { useTranslation } from '../lib/i18n';
import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

export function LanguageSwitcher() {
  const { locale, setLocale, isChangingLocale, availableLocales, localeConfigs } = useLanguage();
  const { t } = useTranslation();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const localeNames = new Map(localeConfigs.map((item) => [item.code, item.nativeName || item.name]));

  const handleLocaleChange = async (newLocale: Locale) => {
    if (isChangingLocale) return;
    await setLocale(newLocale);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="hover:text-red-600 relative"
        aria-label={t('change_language', 'components')}
        aria-expanded={languageMenuOpen}
        aria-haspopup="menu"
        disabled={isChangingLocale}
        onClick={() => setLanguageMenuOpen((isOpen) => !isOpen)}
      >
        {isChangingLocale ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Globe className="w-5 h-5" />
        )}
      </Button>
      {languageMenuOpen && (
        <div className="absolute right-0 top-full mt-1 z-[150] min-w-[140px] rounded-md border bg-white border-gray-200 p-1 shadow-md" role="menu">
          {availableLocales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={async () => {
                await handleLocaleChange(loc);
                setLanguageMenuOpen(false);
              }}
              disabled={isChangingLocale}
              className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 ${
                locale === loc ? 'bg-gray-100 font-medium' : ''
              }`}
              role="menuitem"
            >
              {localeNames.get(loc) || t(`lang_${loc}`, 'components')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
