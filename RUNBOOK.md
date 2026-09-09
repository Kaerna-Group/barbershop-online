# Runbook

## 1. Подготовить Supabase

Создайте отдельные проекты Supabase для тестового и рабочего окружения. В каждом выполните миграции из `supabase/migrations` по порядку, затем загрузите `supabase/seed.sql`.

Через CLI это выглядит так:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

После миграций выполните `supabase/seed.sql` через SQL Editor проекта. Локально seed применяется командой `supabase db reset`.

Не публикуйте service role key и токены SMS. Во фронтенд передаются только URL проекта и публичный anon/publishable key.

## 2. Заполнить реальные данные

До приёма клиентов замените демонстрационные значения через панель мастера или SQL:

- имя;
- телефон и единственный адрес в Румынии;
- необязательное название места приёма;
- услуги, длительности и цены в RON;
- недельный график и исключения.

В проекте намеренно нет фотографий, галереи, сущностей салона и сотрудников.

## 3. Создать аккаунт мастера

1. В Supabase Auth создайте email-пользователя с сильным паролем и подтверждённым email.
2. Скопируйте его UUID.
3. Один раз выполните в SQL Editor:

```sql
update public.app_settings
set master_user_id = 'MASTER_AUTH_USER_UUID'
where singleton;
```

Не добавляйте публичную регистрацию мастера. Сброс пароля настраивается только на подтверждённый email владельца.

## 4. Настроить телефонный вход

В Supabase Auth включите Phone provider и подключите поддерживаемого SMS-провайдера. Добавьте адреса:

- локально: `http://localhost:5173/**`;
- production: `https://kaerna-group.github.io/barbershop-online/**`.

Ограничение повторной отправки OTP оставьте не слабее 60 секунд. Проверьте вход реальным румынским номером в тестовом проекте.

## 5. Настроить уведомления о визитах

Edge Function `send-notifications` ожидает универсальный HTTPS endpoint SMS-провайдера. Он получает JSON:

```json
{
  "to": "+40700000000",
  "message": "Programare confirmată…",
  "idempotencyKey": "notification-job-uuid"
}
```

Задайте секреты и разверните функцию:

```bash
supabase secrets set SMS_WEBHOOK_URL=https://provider.example/send
supabase secrets set SMS_WEBHOOK_TOKEN=...
supabase secrets set NOTIFICATION_WORKER_SECRET=...
supabase functions deploy send-notifications
```

В Supabase Cron создайте POST-вызов функции раз в минуту. Передавайте два заголовка:

- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — для проверки JWT на входе Edge Function;
- `x-worker-secret: <NOTIFICATION_WORKER_SECRET>` — второй независимый секрет воркера.

Оба значения храните в Supabase Vault или в защищённых настройках планировщика, не в SQL миграции и не в репозитории. Сбой SMS не удаляет запись; задача повторяется с увеличивающейся задержкой до пяти попыток.

## 6. GitHub Pages

В настройках репозитория выберите Pages → Source → GitHub Actions. Добавьте repository secrets:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Push в `main` запускает проверки, сборку и публикацию. Без секретов публикуется безопасный demo-режим.

## 7. Проверка перед запуском

Обязательно пройти на тестовой базе:

1. два одновременных запроса на одно время — успешен только один;
2. повтор с тем же `request_id` — возвращает тот же результат;
3. лимит в 3 будущие записи под конкуренцией;
4. перенос в занятое время — исходный визит остаётся;
5. клиент не видит чужие визиты;
6. ручная запись и блокировка не могут пересекаться;
7. границы ровно 2 и 12 часов разрешены;
8. крайняя дата `сегодня + 30` разрешена;
9. смена летнего времени в `Europe/Bucharest` не меняет локальное отображение;
10. устаревшее напоминание после переноса не отправляется.

Запустить локальные проверки:

```bash
npm run check
supabase test db
```

## 8. Резервирование и восстановление

Проверьте доступность автоматических backup в выбранном тарифе Supabase. Если их нет — настройте регулярный логический экспорт PostgreSQL. Не храните экспорт рядом с кодом. Восстановление сначала проверяйте в отдельном проекте с отключённой Edge Function и SMS.
