import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useLanguage, type Locale, SUPPORTED_LOCALES, AVAILABLE_LOCALES } from '../lib/i18n';
import { useTranslation } from '../lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const { t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);

  const handleLocaleChange = async (newLocale: Locale) => {
    setIsChanging(true);
    await setLocale(newLocale);
    setIsChanging(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-red-600"
          aria-label={t('change_language')}
          disabled={isChanging}
        >
          <Globe className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white border-gray-200 z-[150] min-w-[140px]">
        {SUPPORTED_LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            disabled={isChanging}
            className={`hover:bg-gray-100 cursor-pointer ${
              locale === loc ? 'bg-gray-100 font-medium' : ''
            }`}
          >
            <span className="mr-2">{AVAILABLE_LOCALES[loc].flag}</span>
            {AVAILABLE_LOCALES[loc].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
