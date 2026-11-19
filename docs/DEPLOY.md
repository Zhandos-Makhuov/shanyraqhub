# Shanyraq Hub — развёртывание (этап 8)

Решения владельца: хостинг **Cloudflare Pages**, отдельный **боевой проект Supabase** (тестовый `shanyraq-hub-test` остаётся для проверок).

```
GitHub (main) ──► Cloudflare Pages (сборка live) ──► https://<проект>.pages.dev
                        │                                   │
                        └── превью веток ──► тестовый Supabase   └── боевой Supabase
```

## 1. Боевой проект Supabase (владелец) — ✅ создан 20.11.2026: `shanyraq-hub`, ref `gqxdridlxlnouqseeyno`
1. supabase.com → **New project**: имя `shanyraq-hub`, регион **Frankfurt (eu-central-1)**, надёжный пароль базы (хранит только владелец).
2. При создании: **Data API — включён**, автодоступ к новым таблицам — **выключен**, автоматический RLS — **включён** (как у тестового).
3. Токен Management API для боевого проекта (Account → Access Tokens): те же права, что у `claude-push` (Project Settings R, Advisors R, Database RW, Migrations RW, Edge Functions RW, Edge Function Secrets RW). Передаётся **только через защищённую форму** (`request_credential`), не в чат.
4. Publishable key боевого проекта (Project Settings → API Keys, `sb_publishable_…`) — публичный, можно в чат. **Никогда** secret / service_role.

## 2. Схема и сервисы боевого проекта (Claude) — ✅ сделано 20.11.2026 (163/163 проверки, push настроен)
```bash
export SUPABASE_PROJECT_REF=<ref боевого>
python3 supabase/tests/run-cloud.py dryrun      # миграции + seed + все проверки, с откатом
python3 scripts/apply-migrations.py --seed      # применить по-настоящему (история = имена файлов)
python3 supabase/tests/run-cloud.py tests       # проверки на применённой схеме (с откатом)
python3 supabase/tests/run-cloud.py lint
```
Push (как на тестовом, раздел 7 в CLAUDE.md): новые ключи VAPID и общий секрет генерируются в контейнере → секреты Edge Function (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SHQ_PUSH_CRON_SECRET`) → выложить `supabase/functions/send-push` (`verify_jwt=false`) → секреты Vault `shq_push_function_url`, `shq_push_cron_secret`. Секретные значения нигде не сохраняются.

Первый супер-админ: владелец регистрируется на сайте, затем Claude назначает роль одним SQL-запросом (`update public.user_roles set role = 'superadmin' where user_id = …`) — с согласия владельца.

## 3. Вход и почта (владелец, панель Supabase → Authentication)
- **URL Configuration:** Site URL = адрес сайта (`https://<проект>.pages.dev` или свой домен); Redirect URLs — тот же адрес (+ адрес превью при необходимости).
- **Почта (SMTP):** встроенная почта Supabase шлёт письма только адресам команды проекта и с малым лимитом — участники не смогут подтвердить регистрацию. Нужен свой SMTP (отдельное решение владельца: сервис и домен отправителя).
- Минимальная длина пароля — 8 (как на сайте).

## 4. Cloudflare Pages (владелец, по инструкции)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → GitHub → репозиторий `shanyraqhub`.
2. Настройки сборки:
   - Production branch: **`main`**
   - Framework preset: **None** (или Vite)
   - Build command: **`bun install --frozen-lockfile && bun run build`**
   - Build output directory: **`dist`**
3. Переменные окружения (Settings → Variables and Secrets), **Production**:
   | Переменная | Значение |
   |---|---|
   | `VITE_DATA_SOURCE` | `live` |
   | `VITE_SUPABASE_URL` | `https://gqxdridlxlnouqseeyno.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_UYfCmuQOqOEmb5sz4ZImWA_smQ0TQuU` |
   | `VITE_VAPID_PUBLIC_KEY` | `BGLYY490OpfPYG2_tYMox4q17mmlbdRYK-Eq3OjJY6SU4ZPDsKQQ0fFK1Cwg33iB5ldsrBQHMYZreuvIDUbaUMY` |
   | `VITE_APP_URL` | адрес сайта |
   **Preview** (ветки) — тестовый проект:
   | Переменная | Значение |
   |---|---|
   | `VITE_DATA_SOURCE` | `live` |
   | `VITE_SUPABASE_URL` | `https://fwhcaspbbktgpjiskpln.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_dxWo476eKy4s8AYv3vIZ2Q_TIGd7lO5` |
   | `VITE_VAPID_PUBLIC_KEY` | `BAvnbxmzMxov4jcBZvRNvVHQM5upcgfgeujrMfU-SIrUFedJYkHapAjWfG2IwNhdEHziXt5KjguJ-st4IO54-Lo` |
   Все эти значения публичные (попадают в код страницы); секретов в Cloudflare нет.
4. `public/_headers` уже задаёт заголовки (service worker без кэша, камера для QR, защита от встраивания).

## 5. Проверка и запуск
- GitHub Actions (`.github/workflows/ci.yml`) на каждый пуш/PR: проверка типов, демо-сборка, боевая сборка, нет демо-данных в боевой.
- Сначала превью ветки `claude/sleepy-brown-4zolp6` (тестовый Supabase) — проверка в браузере и на телефонах (вход, QR камерой, push на iPhone через «На экран Домой»).
- **Слияние в `main` — только с согласия владельца**; после него Cloudflare публикует боевой сайт.
- Бесплатный Supabase засыпает после 7 дней без обращений — следить или перейти на платный план.
