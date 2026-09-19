# Android APK — Life Control

Проект собирается GitHub Actions или локальным Android SDK. Внутри APK лежит тот же офлайн-first `index.html`.

## Что есть
- WebView + локальный `index.html`;
- localStorage/IndexedDB;
- Supabase Auth и синхронизация через интернет;
- Gemini через Supabase Edge Function — ключ Gemini в APK не хранится;
- AndroidBridge для уведомлений;
- ежедневные уведомления по 3 этапам, включая предупреждение до этапа;
- восстановление уведомлений после перезагрузки телефона.

## Сборка
Из корня репозитория:
```bash
node tools/sync-platforms.mjs
cd android
gradle assembleRelease
```
APK будет в `android/app/build/outputs/apk/release/app-release.apk`.

На Android 13+ нужно разрешить уведомления. Для точных AlarmManager-срабатываний Android 12+ может потребовать разрешение точных будильников.
