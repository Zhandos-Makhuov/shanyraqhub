/** Local calendar day as YYYY-MM-DD (not UTC, so late-evening activity counts for the right day). */
export const toLocalDay = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Consecutive active days ending today. If there is no activity yet today,
 * the streak still counts from yesterday (it only breaks after a full missed day).
 */
export const computeDayStreak = (activeDays: Iterable<string>, now: Date = new Date()): number => {
  const days = new Set(activeDays);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(toLocalDay(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(toLocalDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

/** Russian plural: 1 день, 2 дня, 5 дней. */
export const pluralDaysRu = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
};
