LIFE CONTROL V42

Личная система управления жизнью: офлайн-first ядро, облачная память Supabase, email/password, Gemini 2.5 Flash через защищённую Edge Function, Android wrapper и Windows wrapper.

ПОЧТА АККАУНТА
Интерфейс входа предварительно заполняет `doxajooon@gmail.com`. Кнопка восстановления отправляет письмо на введённый адрес; по умолчанию это этот адрес. Пароль не хранится в исходниках и должен быть задан тобой при создании аккаунта.

SUPABASE
Проект: `riqmwueobjazfnhvvumy`
Таблица: `public.life_state`
Edge Function: `life-control-ai`

GEMINI
Модель: `gemini-2.5-flash`
Ключ хранится только как `GEMINI_API_KEY` в Supabase Edge Functions → Secrets. Не помещай его в GitHub, HTML, JS или APK.

ПУБЛИКАЦИЯ
1) Загрузи содержимое архива в репозиторий `Doxajooon/life`.
2) GitHub Actions → `Deploy Life Control`.
3) Для APK/EXE запусти workflow `Build Android APK + Windows EXE`.
4) В Supabase Auth → URL Configuration добавь URL GitHub Pages, чтобы письма восстановления возвращали пользователя в приложение.

ПОЛНОЕ ОПИСАНИЕ: `BUILD_RELEASE_RU.md`.


ГОТОВЫЙ WINDOWS EXE
`release/LifeControl-Windows-x64.exe` — уже собранный x64 launcher.

ANDROID
Исходник Android + GitHub Actions находятся в `android/` и `.github/workflows/build-mobile-desktop.yml`. В текущем контейнере Android SDK отсутствует, поэтому APK бинарником сюда не включён; workflow соберёт его на GitHub.
