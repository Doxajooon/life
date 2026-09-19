# Life Control V42 — запуск и публикация

## 1. Web / GitHub Pages
Репозиторий: `Doxajooon/life`, ветка `main`. После загрузки архива workflow `Deploy Life Control` публикует папку `public/` на GitHub Pages.

Ожидаемый адрес Pages: `https://doxajooon.github.io/life/`.

## 2. Supabase Auth
Используется email + пароль. В интерфейсе email по умолчанию `doxajooon@gmail.com`. Кнопка **Сбросить пароль на почту** отправляет письмо восстановления.

Для письма восстановления в Supabase Auth → URL Configuration добавь адрес Pages как Site URL и Redirect URL. Это нужно, потому что Auth возвращает пользователя обратно в приложение после клика по письму.

## 3. Gemini
Gemini API key не находится в HTML, JavaScript, Android APK или GitHub. Он должен оставаться только в Supabase Edge Function Secret `GEMINI_API_KEY`.

## 4. AI
Endpoint: `https://riqmwueobjazfnhvvumy.supabase.co/functions/v1/life-control-ai`
Модель: `gemini-2.5-flash`.

AI запускается вручную, получает выбранные пользователем разделы, читает текущую строку `public.life_state` текущего аккаунта и сохраняет историю анализа в `state.ai.history`.

## 5. Android
Сборка выполняется GitHub Actions workflow `Build Android APK + Windows EXE`. APK появляется как artifact `life-control-android-apk`.

## 6. Windows
В архиве уже есть `release/LifeControl-Windows-x64.exe` — нативный launcher, который встраивает web-бандл, запускает локальный сервер и открывает Life Control в браузере.
Дополнительно workflow собирает WPF/WebView2 artifact `life-control-windows-exe` и native launcher artifact `life-control-windows-native-x64`.
