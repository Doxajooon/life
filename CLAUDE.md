# Jamal Life — инструкции для Claude Code

Прочитай `docs/TZ.md` целиком перед любой работой: там архитектура, правила, задачи (раздел 6) и шаблон отчёта (раздел 7).

Коротко:
- Всё приложение — `index.html` (+ `sw.js`, `fonts/`, `sounds/`); Android и Windows получают копии через `node tools/sync-platforms.mjs`.
- Перед коммитом: `node tools/sync-platforms.mjs && node tests/static_qa.mjs && node tests/e2e.mjs` (и `CPU_SLOW=4 node tests/e2e.mjs`).
- Выпуск = поднять версию во всех файлах (список в TZ, раздел 5.2) и push в `main`.
- Не менять формат данных без миграции в `normalize()`; никаких SQL-миграций и удаления данных в Supabase без согласия владельца; не коммитить секреты.
- Отвечать владельцу по-русски, коротко и понятно.
