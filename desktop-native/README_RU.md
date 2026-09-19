# Life Control Windows EXE

`main.go` — простой нативный Windows launcher. Он встраивает web-бандл Life Control внутрь executable, запускает локальный HTTP-сервер на `127.0.0.1` и открывает приложение в браузере. На этом уровне данные остаются офлайн-first, а Supabase/Gemini работают онлайн.

## Сборка

```powershell
go build -trimpath -ldflags="-H=windowsgui" -o LifeControl.exe .
```

Готовый x64 EXE также собирается GitHub Actions вместе с WPF/WebView2 wrapper.
