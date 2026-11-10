# Схема бази даних ImHere

Основна база: Cloudflare D1 `imhere-db` (`09c258af-07aa-4e64-b52a-1e042be1da12`). Worker отримує її через binding `DB`, визначений у `backend/wrangler.jsonc`.

## Структура

| Таблиця | Призначення | Зв'язки та обмеження |
|---|---|---|
| `users` | Облікові записи | `email` унікальний; `role` — `teacher` або `student` |
| `groups` | Навчальні групи | `teacher_id` → `users.id` |
| `group_members` | Учні у групах | `group_id` → `groups.id`; `student_id` → `users.id`; складений первинний ключ `(group_id, student_id)` |
| `lessons` | Заняття | `group_id` → `groups.id`; `teacher_id` → `users.id`; `status` — `planned`, `active` або `closed` |
| `attendance` | Відвідування | `lesson_id` → `lessons.id`; `student_id` → `users.id`; `UNIQUE (lesson_id, student_id)` забороняє повторну відмітку учня на занятті |
| `sessions` | Активні сесії | `user_id` → `users.id`; `token_hash` унікальний |
| `audit_logs` | Журнал аудиту | `actor_id`, `entity_type` та `entity_id` зберігаються як необов'язкові значення без FK |
| `api_rate_limits` | Ліміти частоти для чутливих запитів | Первинний ключ — SHA-256 хеш області та ідентифікатора; вікна оновлюються атомарним upsert |

## Індекси

- `idx_groups_teacher` на `groups(teacher_id)`
- `idx_members_student` на `group_members(student_id)`
- `idx_lessons_group` на `lessons(group_id)`
- `idx_attendance_lesson` на `attendance(lesson_id)`
- `idx_attendance_student` на `attendance(student_id)`
- `idx_sessions_user` на `sessions(user_id)`
- `idx_api_rate_limits_updated` на `api_rate_limits(updated_at)`

## Міграції

Канонічне джерело схеми — SQL-файли у `backend/migrations`:

1. `20261109214157_initial_schema.sql` створює таблиці та обмеження.
2. `20261109214200_add_indexes.sql` створює індекси.
3. `20261109231000_add_api_rate_limits.sql` створює глобальне D1-сховище лімітів.

Застосування з `backend`:

```sh
npx wrangler d1 migrations apply imhere-db --local
npx wrangler d1 migrations apply imhere-db --remote
```

`backend/schema.sql` наразі описує іншу, несумісну модель даних. Не застосовуй його паралельно з міграціями, доки ці схеми не буде узгоджено.
