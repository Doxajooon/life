SUPABASE — LIFE CONTROL

Проект: `riqmwueobjazfnhvvumy`
Таблица: `public.life_state`
Edge Function: `life-control-ai`

AUTH
Email + пароль. В форме входа email по умолчанию: `doxajooon@gmail.com`. Есть кнопки входа, создания аккаунта, синхронизации, выхода и восстановления пароля по email.

PASSWORD RESET
Кнопка восстановления вызывает Supabase Auth recovery endpoint. После перехода по письму Life Control принимает recovery-сессию и предлагает задать новый пароль.

URL CONFIGURATION
Для hosted GitHub Pages добавь URL приложения в Supabase Auth → URL Configuration как Site URL и разрешённый Redirect URL.

AI
Gemini ключ хранится только в Edge Function Secret `GEMINI_API_KEY`.
