const NO_INPUT_TRANSLATION_RESPONSE = /(?:\bthere is no text provided\.\s*please paste the text you would like me to translate\.?|\b(?:it seems like )?there(?:['’]s| is) no text provided\b[\s\S]*\b(?:provide|paste|send)\b[\s\S]*\btext\b[\s\S]*\btranslat(?:e|ion)\b|\b(?:once|when) you (?:provide|paste|send) (?:the )?text\b[\s\S]*\btranslat(?:e|ion)\b)/i;

const isNoInputTranslationResponse = (value) => (
  typeof value === 'string' && NO_INPUT_TRANSLATION_RESPONSE.test(value.trim())
);

const containsNoInputTranslationResponse = (value) => {
  if (isNoInputTranslationResponse(value)) return true;
  if (Array.isArray(value)) return value.some(containsNoInputTranslationResponse);
  if (value instanceof Map) return [...value.values()].some(containsNoInputTranslationResponse);
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsNoInputTranslationResponse);
  }
  return false;
};

const restoreNoInputTranslationResponses = (translated, source) => {
  if (isNoInputTranslationResponse(translated)) return source;
  if (Array.isArray(translated)) {
    return translated.map((value, index) => restoreNoInputTranslationResponses(value, source?.[index]));
  }
  if (translated instanceof Map) {
    const sourceMap = source instanceof Map ? source : new Map(Object.entries(source || {}));
    return new Map([...translated.entries()].map(([key, value]) => [
      key,
      restoreNoInputTranslationResponses(value, sourceMap.get(key)),
    ]));
  }
  if (translated && typeof translated === 'object') {
    return Object.fromEntries(Object.entries(translated).map(([key, value]) => [
      key,
      restoreNoInputTranslationResponses(value, source instanceof Map ? source.get(key) : source?.[key]),
    ]));
  }
  return translated;
};

module.exports = {
  isNoInputTranslationResponse,
  containsNoInputTranslationResponse,
  restoreNoInputTranslationResponses,
};
