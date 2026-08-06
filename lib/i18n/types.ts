export type Locale = 'vi' | 'en';

export type TranslationDict = {
  [key: string]: string | TranslationDict;
};

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;
