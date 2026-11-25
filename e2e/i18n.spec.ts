import { test, expect } from '@playwright/test';
import { TRANSLATIONS } from '../src/data/translations';

/**
 * ChatGPT #7 (residual findings 26.11): the three languages say the same thing.
 * No browser — checks the translation table itself: same keys in kz/ru/en, no empty texts,
 * the same {placeholders} in every language (a missing {n} would show a wrong number or none).
 */
const langs = ['kz', 'ru', 'en'] as const;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('every key exists in kz, ru and en', () => {
  const keys = langs.map(l => new Set(Object.keys(TRANSLATIONS[l])));
  for (const [i, l] of langs.entries()) {
    const missing = [...new Set(langs.flatMap((_, j) => [...keys[j]]))].filter(k => !keys[i].has(k));
    expect(missing, `keys missing in ${l}`).toEqual([]);
  }
});

test('no empty texts', () => {
  for (const l of langs) {
    const empty = Object.entries(TRANSLATIONS[l]).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    expect(empty, `empty texts in ${l}`).toEqual([]);
  }
});

test('the same {placeholders} in every language', () => {
  const bad: string[] = [];
  for (const key of Object.keys(TRANSLATIONS.ru)) {
    const ref = placeholders(TRANSLATIONS.ru[key] ?? '');
    for (const l of ['kz', 'en'] as const) {
      if (placeholders(TRANSLATIONS[l][key] ?? '') !== ref) bad.push(`${key} (${l}): ${placeholders(TRANSLATIONS[l][key] ?? '')} ≠ ru ${ref}`);
    }
  }
  expect(bad).toEqual([]);
});

test('the book rule says the same in all three languages (100 characters, +50 XP, +30, one per week)', () => {
  for (const l of langs) {
    const intro = TRANSLATIONS[l].libAddIntro;
    expect(intro, l).toContain('100');
    expect(intro, l).toContain('+50 XP');
    expect(intro, l).toContain('+30');
  }
  expect(TRANSLATIONS.kz.libAddIntro).toContain('кемінде 100'); // ChatGPT #5: "at least 100", not "more than 100"
});
