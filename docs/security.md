# Безпека API

- Сесійний токен міститься лише у `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned` cookie. У D1 зберігається його SHA-256 хеш; стандартний строк дії — 24 години.
- Чутливі `POST` і `DELETE` запити вимагають дозволений `Origin` та CSRF-токен у `X-CSRF-Token`, який збігається з короткоживучою CSRF-cookie.
- `ALLOWED_ORIGINS` має містити лише довірені origin без wildcard. Для production внеси точний frontend origin.
- Публічна реєстрація створює тільки `student`. Роль викладача не приймається з тіла запиту.
- Пароль хешується PBKDF2-HMAC-SHA-256 з індивідуальною випадковою сіллю та pepper у Worker secret `AUTH_PEPPER`. Алгоритм використовує Web Crypto, який підтримується Workers. Поточні 20 000 ітерацій вибрані з огляду на 10 ms CPU-ліміт Workers Free; фактичний CPU слід перевіряти в Cloudflare після розгортання.
- QR-підпис формується HMAC-SHA-256 через Web Crypto з окремим Worker secret `QR_SECRET`. Секрети зберігаються у Cloudflare Secrets; локально використовуються з ігнорованого Git файлу `backend/.dev.vars`.
- Ліміти частоти для входу/реєстрації, QR і відміток зберігаються у D1 атомарними upsert-запитами, а не у KV. Cleanup Cron видаляє прострочені дані.
- Усі вхідні JSON-тіла обмежені 16 KiB. SQL виконується через параметри D1 `.bind(...)`.
- Короткочасний QR зменшує повторне використання старого коду, але не підтверджує фізичну присутність: актуальний QR можна передати іншому учню.

## Cookies і сторонні сайти

GitHub Pages та `workers.dev` є різними сайтами. Сесійні cookies встановлюються як `SameSite=None; Secure; Partitioned` з credentialed CORS для точного дозволеного origin. Браузери мають різні правила для сторонніх cookies; якщо цільовий браузер блокує їх, розмісти frontend та API на одному site або використовуй same-site custom domain.

## Обмеження rate limiting

Ліміт реалізовано в D1, щоб усі екземпляри Worker оновлювали один атомарний лічильник і не покладалися на eventually-consistent KV. Усі запити до чутливих endpoint спершу перевіряють лічильник.
