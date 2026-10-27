package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id"), kind = intent.getStringExtra("kind"), time = intent.getStringExtra("time");
        String title = intent.getStringExtra("title"), body = intent.getStringExtra("body"), days = intent.getStringExtra("days");
        // 74.2: a weekday alarm stays silent on the other days and simply waits for the next day
        // 74.7: ONE ring per moment. Android can deliver the same alarm twice (doze, reboot, app update);
        // a second delivery within 2 minutes is ignored, so the chime is heard once.
        String key = id == null ? "alarm" : id;
        SharedPreferences last = ctx.getSharedPreferences("jl_rang", Context.MODE_PRIVATE);
        long nowMs = System.currentTimeMillis();
        boolean twice = nowMs - last.getLong(key, 0L) < 120_000L;
        last.edit().putLong(key, nowMs).apply();
        // 75.0: quiet hours (19:00–06:30) and silent / vibrate mode: nothing is shown or heard
        boolean ring = (!"daily".equals(kind) || AlarmScheduler.ringsToday(days)) && !twice && !NotificationUtil.blocked(ctx);
        // 74.7: the hourly reminder («every1h_HH00») plays the nature sound
        boolean nature = key.startsWith("every1h_");
        if (ring) NotificationUtil.show(ctx, title, body, key.hashCode(), taskOf(id), intent.getLongExtra("due", 0), nature);
        JamalWidget.updateAll(ctx);
        if (id == null) return;
        if ("daily".equals(kind) && time != null) AlarmScheduler.schedule(ctx, id, time, days, title, body);
        else AlarmScheduler.fired(ctx, id, kind);
    }

    /** task_<id>, taskpre_<id>, tasksnz_<id> → <id>; stend_<stage>[@n] (10 min before a stage ends) → stage:<stage>; other alarms have no buttons. */
    static String taskOf(String id) {
        if (id == null) return null;
        if (id.startsWith("stend_")) { String st = id.substring(6); int at = st.indexOf('@'); return "stage:" + (at > 0 ? st.substring(0, at) : st); }
        if (id.startsWith("task_")) return id.substring(5);
        if (id.startsWith("taskpre_") || id.startsWith("tasksnz_")) return id.substring(8);
        return null;
    }
}
