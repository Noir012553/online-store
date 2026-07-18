import { Globe, Loader2 } from 'lucide-react';
import { useLanguage, type Locale } from '../lib/i18n';
import { useTranslation } from '../lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';

export function LanguageSwitcher() {
  const { locale, setLocale, isChangingLocale, availableLocales, localeConfigs } = useLanguage();
  const { t } = useTranslation();
  const localeNames = new Map(localeConfigs.map((item) => [item.code, item.nativeName || item.name]));

  const handleLocaleChange = async (newLocale: Locale) => {
    if (isChangingLocale) return;
    await setLocale(newLocale);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-red-600 relative"
          aria-label={t('change_language', 'components')}
          disabled={isChangingLocale}
        >
          {isChangingLocale ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Globe className="w-5 h-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white border-gray-200 z-[150] min-w-[140px]">
        {availableLocales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            disabled={isChangingLocale}
            className={`hover:bg-gray-100 cursor-pointer ${
              locale === loc ? 'bg-gray-100 font-medium' : ''
            }`}
          >
            {localeNames.get(loc) || t(`lang_${loc}`, 'components')}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
