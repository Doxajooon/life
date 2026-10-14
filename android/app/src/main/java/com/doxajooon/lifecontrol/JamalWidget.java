package com.doxajooon.lifecontrol;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: current stage of the day with its progress, the next task, and a «+» button.
 * The web app hands over the day schedule and the tasks (AndroidBridge.updateWidget); the widget
 * works out "now" by itself, so it stays right while the app is closed (refreshed by the
 * stage/task alarms, by the system every 30 minutes and whenever the app is open).
 */
public class JamalWidget extends AppWidgetProvider {
    static final String PREF = "jl_widget_v1";
    static final String QUICK_ADD = "com.doxajooon.lifecontrol.QUICK_ADD";

    @Override public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) { render(ctx, mgr, ids); }

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString("data", json == null ? "{}" : json).apply();
        updateAll(ctx);
    }

    /** «Готово» pressed in a notification: the task disappears from the widget right away. */
    static void markDone(Context ctx, String taskId) {
        try {
            JSONObject d = new JSONObject(ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString("data", "{}"));
            JSONArray t = d.optJSONArray("tasks");
            if (t == null) return;
            for (int i = 0; i < t.length(); i++) {
                JSONObject o = t.optJSONObject(i);
                if (o != null && taskId.equals(o.optString("id"))) o.put("done", true);
            }
            ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString("data", d.toString()).apply();
        } catch (Exception ignored) {}
        updateAll(ctx);
    }

    static void updateAll(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, JamalWidget.class));
            if (ids != null && ids.length > 0) render(ctx, mgr, ids);
        } catch (Exception ignored) {}
    }

    private static int toMin(String hhmm) {
        try { String[] p = hhmm.split(":"); return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim()); }
        catch (Exception e) { return -1; }
    }

    private static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        String stage = "Открой Jamal Life", range = "", task = "Задач больше нет";
        int pct = 0;
        try {
            JSONObject d = new JSONObject(ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString("data", "{}"));
            Calendar c = Calendar.getInstance();
            int now = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
            String today = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
            JSONArray steps = d.optJSONArray("steps");
            if (steps != null && steps.length() > 0) {
                stage = "День завершён — отдых";
                for (int i = 0; i < steps.length(); i++) {
                    JSONObject s = steps.getJSONObject(i);
                    int st = toMin(s.optString("t")), en = toMin(s.optString("e"));
                    if (st < 0 || en <= st) continue;
                    if (now >= st && now < en) {
                        stage = "Этап " + (i + 1) + " · " + s.optString("title");
                        range = s.optString("t") + "–" + s.optString("e");
                        pct = Math.round((now - st) * 100f / (en - st));
                        break;
                    }
                    if (now < st) {
                        stage = "Дальше: " + s.optString("title");
                        range = "в " + s.optString("t");
                        pct = 0;
                        break;
                    }
                    pct = 100;
                }
            }
            JSONArray tasks = d.optJSONArray("tasks");
            if (tasks != null) {
                int best = Integer.MAX_VALUE, open = 0;
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.getJSONObject(i);
                    if (!today.equals(t.optString("date")) || t.optBoolean("done")) continue;
                    open++;
                    int m = toMin(t.optString("time"));
                    int key = m < 0 ? 24 * 60 + i : (m < now - 60 ? 48 * 60 + m : m); // overdue >1h goes last
                    if (key < best) {
                        best = key;
                        task = (m >= 0 ? t.optString("time") + "  " : "") + t.optString("title");
                    }
                }
                if (open > 1) task = task + "  (+" + (open - 1) + ")";
            }
        } catch (Exception ignored) {}

        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_jamal);
            v.setTextViewText(R.id.w_stage, stage);
            v.setTextViewText(R.id.w_range, range);
            v.setTextViewText(R.id.w_task, task);
            v.setProgressBar(R.id.w_progress, 100, Math.max(0, Math.min(100, pct)), false);
            Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 701, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            Intent add = new Intent(ctx, MainActivity.class).setAction(QUICK_ADD).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            v.setOnClickPendingIntent(R.id.w_plus, PendingIntent.getActivity(ctx, 702, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            mgr.updateAppWidget(id, v);
        }
    }
}
