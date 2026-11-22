# Phase 2.3.2.1 — Final Profile QA Correction. Отчёт

Дата: 22.11.2026. Ветка `claude/sleepy-brown-4zolp6`. `main` и production не тронуты, слияния и деплоя не было.

## Замечание
В `MemberProfileModal.tsx` раскрываемый полный список достижений строился из `member.achievements` без учёта отзыва, тогда как «Последние достижения» и кнопка «Барлығы (n)» уже отбрасывали отозванные.

## Исправление (только `src/components/MemberProfileModal.tsx`)
- Полный список: `member.achievements.filter(ach => !(member.revokedAchievementIds ?? []).includes(ach.id))` — та же логика, что в `recentAchievements` / `activeAchievementCount`; нового helper нет.
- Заголовок полного списка «Марапаттар… (n)» — `activeAchievementCount(member)` (как и кнопка «Барлығы (n)»). Краткий список, кнопка и полный список теперь согласованы.
- Каждому элементу полного списка добавлен атрибут `data-member-achievement` (для проверки; на вид не влияет).
- UX и дизайн Phase 2.3.2 не менялись; `ProfileView` не менялся.

## E2E (`e2e/profile-overview.spec.ts`, +1 проверка)
Участник с 5 достижениями, самое новое из них отозвано:
- краткий список — 3 новейших действующих (`ach-kind-word`, `ach-first-book`, `ach-first-event`), отозванного нет;
- кнопка — «Барлығы (4)»;
- раскрытый список — ровно 4 действующих, заголовок «(4)»;
- отозванное `ach-knowledge-seeker` нет ни в кратком, ни в раскрытом списке; горизонтальной прокрутки нет.

## Проверки
| Проверка | Результат |
|---|---|
| `bun run lint` | ✅ |
| `bun run build` (демо) и live-сборка | ✅; в live-сборке нет демо-имён |
| E2E | ✅ **79/79** (было 78), дважды подряд |
| CI GitHub Actions | см. ответ в чате |

## Подтверждение
Не изменялись: `ProfileView`, backend, Supabase, RLS, миграции, RPC, XP, коины, уровни, правила достижений, production, `main`. Бэклог не менялся. Live на тестовой базе не прогонялся: в live отозванное достижение удаляется сервером из `user_achievements` и в список не попадает (проверено в Phase 2.3.2); исправление — защитный фильтр на стороне сайта.
