# Windows EXE — Life Control

Desktop wrapper на WPF + WebView2. Внутри запускается локальный web-бандл Life Control, поэтому ядро работает без интернета; Supabase/Gemini используются только онлайн.

## Сборка
```powershell
cd desktop
dotnet publish LifeControl.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

WebView2 Runtime должен быть установлен в Windows. На Windows 10/11 он обычно уже присутствует; при необходимости устанавливается отдельно.
