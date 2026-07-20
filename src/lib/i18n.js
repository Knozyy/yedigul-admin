export const CONTENT_LANGUAGES = Object.freeze([
  { code: 'tr', label: 'Türkçe', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
]);

export function foldForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase();
}

function flatten(value) {
  if (Array.isArray(value)) return value.join(' ');
  return value ?? '';
}

export function productMatchesQuery(product, query) {
  const needle = foldForSearch(query).trim();
  if (!needle) return true;
  const fields = ['name', 'desc', 'ing', 'alg'];
  const haystack = CONTENT_LANGUAGES
    .flatMap(({ code }) => fields.map((field) => flatten(product?.[`${field}_${code}`])))
    .join(' ');
  return foldForSearch(haystack).includes(needle);
}

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return !String(value ?? '').trim();
}

export function missingProductTranslationCodes(product) {
  return ['ar', 'ru'].filter((code) => {
    if (isEmpty(product?.[`name_${code}`])) return true;
    for (const field of ['desc', 'ing', 'alg']) {
      const hasSource = !isEmpty(product?.[`${field}_tr`]) || !isEmpty(product?.[`${field}_en`]);
      if (hasSource && isEmpty(product?.[`${field}_${code}`])) return true;
    }
    return (product?.variants || []).some((variant) => isEmpty(variant?.[`name_${code}`]));
  });
}

export function missingCategoryTranslationCodes(category) {
  return ['ar', 'ru'].filter((code) => isEmpty(category?.[`name_${code}`]));
}
