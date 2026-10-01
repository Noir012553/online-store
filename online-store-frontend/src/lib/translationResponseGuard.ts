const NO_INPUT_TRANSLATION_RESPONSE = /(?:\bthere is no text provided\.\s*please paste the text you would like me to translate\.?|\b(?:it seems like )?there(?:['’]s| is) no text provided\b[\s\S]*\b(?:provide|paste|send)\b[\s\S]*\btext\b[\s\S]*\btranslat(?:e|ion)\b|\b(?:once|when) you (?:provide|paste|send) (?:the )?text\b[\s\S]*\btranslat(?:e|ion)\b)/i;

export const isNoInputTranslationResponse = (value: unknown): value is string => (
  typeof value === 'string' && NO_INPUT_TRANSLATION_RESPONSE.test(value.trim())
);
