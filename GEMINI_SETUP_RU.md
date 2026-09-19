# LIFE CONTROL — Gemini + Supabase

## Уже готово
- Edge Function `life-control-ai` активна в проекте Supabase;
- модель `gemini-2.5-flash`;
- API key не входит в исходный код;
- клиент вызывает только Supabase Edge Function после авторизации;
- история AI сохраняется в `state.ai.history`.

## Секрет
В Supabase → Edge Functions → Secrets должен быть:
- Key: `GEMINI_API_KEY`
- Value: ключ из Google AI Studio.

## AI URL
`https://riqmwueobjazfnhvvumy.supabase.co/functions/v1/life-control-ai`
