# Схема бази даних ImHere

Основна база: Cloudflare D1 `imhere-db` (`09c258af-07aa-4e64-b52a-1e042be1da12`). Worker отримує її через binding `DB`, визначений у `backend/wrangler.jsonc`.

## Структура

| Таблиця | Призначення | Зв'язки та обмеження |
|---|---|---|
| `users` | Облікові записи | `username` унікальний і використовується для входу; `role` — `teacher` або `student`; нові записи мають `approval_status = pending`; `is_admin` визначає адміністратора |
| `groups` | Навчальні групи | `teacher_id` → `users.id` |
| `group_members` | Учні у групах | `group_id` → `groups.id`; `student_id` → `users.id`; складений первинний ключ `(group_id, student_id)` |
| `lessons` | Заняття | `group_id` → `groups.id`; `teacher_id` → `users.id`; `status` — `planned`, `active` або `closed`; `late_threshold_minutes` задає поріг запізнення |
| `attendance` | Журнал заняття | `lesson_id` → `lessons.id`; `student_id` → `users.id`; статус `present`, `late` або `absent`; хвилини запізнення, оцінка 1–12, автор ручної зміни; `UNIQUE (lesson_id, student_id)` забороняє дублікати |
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
4. `20261114120000_add_attendance_status_and_grades.sql` додає статуси відвідування, запізнення, оцінку та поріг запізнення.
5. `20261114130000_add_usernames_and_admin_approvals.sql` додає логіни, стани схвалення заявок і ознаку адміністратора.

Застосування з `backend`:

```sh
npx wrangler d1 migrations apply imhere-db --local
npx wrangler d1 migrations apply imhere-db --remote
```

Файли міграцій є єдиним джерелом схеми; застосовуй їх у потрібному середовищі командами вище.
