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

/** Monday (local) of the week containing `date`, as YYYY-MM-DD. Weeks run Monday–Sunday. */
export const weekStartDay = (date: Date): string => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return toLocalDay(d);
};

/**
 * Consecutive weeks (Mon–Sun) with at least one active day, ending this week.
 * If there is no activity yet this week, the streak still counts from last week,
 * so it only breaks after a whole week without activity. Fits weekly club meetings.
 */
export const computeWeekStreak = (activeDays: Iterable<string>, now: Date = new Date()): number => {
  const weeks = new Set<string>();
  for (const day of activeDays) {
    const [y, m, d] = day.split('-').map(Number);
    if (y && m && d) weeks.add(weekStartDay(new Date(y, m - 1, d)));
  }
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // this week's Monday
  if (!weeks.has(toLocalDay(cursor))) {
    cursor.setDate(cursor.getDate() - 7);
  }
  let streak = 0;
  while (weeks.has(toLocalDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
};

/** Russian plural: 1 неделя, 2 недели, 5 недель. */
export const pluralWeeksRu = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'неделя';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'недели';
  return 'недель';
};
