package com.doxajooon.lifecontrol;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Exact alarms for reminders, so they ring even when the app is closed.
 *  - daily:  repeats every day at HH:MM (stages of the day)
 *  - once:   a single moment in epoch millis (tasks)
 * Everything is persisted (JSON, safe for any title text) and restored after reboot / app update.
 */
public final class AlarmScheduler {
    private static final String PREF = "jl_alarms_v2";
    private AlarmScheduler() {}

    static int requestCode(String id) { return id.hashCode() & 0x7fffffff; }

    private static PendingIntent pending(Context ctx, String id, Intent extras) {
        Intent i = new Intent(ctx, AlarmReceiver.class).setAction("JAMAL_LIFE_ALARM").setData(android.net.Uri.parse("jamal://alarm/" + id));
        if (extras != null) i.putExtras(extras);
        return PendingIntent.getBroadcast(ctx, requestCode(id), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setExact(Context ctx, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    static long nextDaily(int hh, int mm) {
        Calendar now = Calendar.getInstance(), at = Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY, hh); at.set(Calendar.MINUTE, mm); at.set(Calendar.SECOND, 0); at.set(Calendar.MILLISECOND, 0);
        if (!at.after(now)) at.add(Calendar.DAY_OF_YEAR, 1);
        return at.getTimeInMillis();
    }

    static void schedule(Context ctx, String id, String time, String title, String body) {
        String[] p = String.valueOf(time).split(":");
        if (p.length < 2) return;
        int hh, mm;
        try { hh = Integer.parseInt(p[0].trim()); mm = Integer.parseInt(p[1].trim()); } catch (Exception e) { return; }
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return;
        Intent x = new Intent();
        x.putExtra("id", id); x.putExtra("kind", "daily"); x.putExtra("time", String.format(java.util.Locale.US, "%02d:%02d", hh, mm));
        x.putExtra("title", title); x.putExtra("body", body);
        setExact(ctx, nextDaily(hh, mm), pending(ctx, id, x));
        save(ctx, id, "daily", x.getStringExtra("time"), 0, title, body);
    }

    static void scheduleOnce(Context ctx, String id, double atMillis, String title, String body) {
        long at = (long) atMillis;
        if (at <= System.currentTimeMillis()) { cancel(ctx, id); return; }
        Intent x = new Intent();
        x.putExtra("id", id); x.putExtra("kind", "once"); x.putExtra("title", title); x.putExtra("body", body);
        setExact(ctx, at, pending(ctx, id, x));
        save(ctx, id, "once", "", at, title, body);
    }

    static void cancel(Context ctx, String id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx, id, null));
        prefs(ctx).edit().remove(id).apply();
    }

    static void cancelTask(Context ctx, String task) {
        cancel(ctx, "task_" + task); cancel(ctx, "taskpre_" + task); cancel(ctx, "tasksnz_" + task);
    }

    private static void save(Context ctx, String id, String kind, String time, long at, String title, String body) {
        try {
            JSONObject o = new JSONObject();
            o.put("kind", kind); o.put("time", time); o.put("at", at);
            o.put("title", title == null ? "" : title); o.put("body", body == null ? "" : body);
            prefs(ctx).edit().putString(id, o.toString()).apply();
        } catch (Exception ignored) {}
    }

    static void fired(Context ctx, String id, String kind) {
        if ("once".equals(kind)) prefs(ctx).edit().remove(id).apply();
    }

    /** Removes alarms registered by Life Control (before the Jamal Life rename). */
    static void dropLegacy(Context ctx) {
        SharedPreferences old = ctx.getSharedPreferences("lc_alarms", Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (String id : old.getAll().keySet()) {
            Intent i = new Intent(ctx, AlarmReceiver.class).setAction("LIFE_CONTROL_ALARM");
            PendingIntent pi = PendingIntent.getBroadcast(ctx, requestCode(id), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            if (am != null) am.cancel(pi);
        }
        old.edit().clear().apply();
    }

    static void rescheduleAll(Context ctx) {
        dropLegacy(ctx);
        for (String id : prefs(ctx).getAll().keySet()) {
            try {
                JSONObject o = new JSONObject(prefs(ctx).getString(id, "{}"));
                if ("once".equals(o.optString("kind"))) scheduleOnce(ctx, id, o.optLong("at"), o.optString("title"), o.optString("body"));
                else schedule(ctx, id, o.optString("time"), o.optString("title"), o.optString("body"));
            } catch (Exception ignored) {}
        }
    }
}
