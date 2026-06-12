import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { translationService } from '../lib/translationService';
import { useLanguage } from '../lib/i18n';

interface LiveTranslationButtonProps {
  text: string;
  onTranslated?: (translatedText: string) => void;
  targetLang?: string;
  size?: 'sm' | 'default' | 'lg';
}

export function LiveTranslationButton({
  text,
  onTranslated,
  targetLang,
  size = 'sm',
}: LiveTranslationButtonProps) {
  const { locale, t } = useLanguage();
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTranslate = async () => {
    if (translatedText) {
      setIsExpanded(!isExpanded);
      return;
    }

    setIsLoading(true);
    try {
      const result = await translationService.translateText(
        text,
        targetLang || locale,
        'vi',
        true
      );
      setTranslatedText(result);
      setIsExpanded(true);
      onTranslated?.(result);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size={size}
        onClick={handleTranslate}
        disabled={isLoading}
        className="w-fit gap-2 text-xs"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe className="w-4 h-4" />
        )}
        {isLoading ? t('translating_label', 'common') : t('translate_button', 'common')}
      </Button>
      {translatedText && isExpanded && (
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm">
          <p className="text-gray-700">{translatedText}</p>
        </div>
      )}
    </div>
  );
}
