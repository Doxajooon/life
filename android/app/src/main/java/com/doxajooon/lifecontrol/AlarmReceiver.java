package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id"), kind = intent.getStringExtra("kind"), time = intent.getStringExtra("time");
        String title = intent.getStringExtra("title"), body = intent.getStringExtra("body"), days = intent.getStringExtra("days");
        // 74.2: a weekday alarm stays silent on the other days and simply waits for the next day
        boolean ring = !"daily".equals(kind) || AlarmScheduler.ringsToday(days);
        if (ring) NotificationUtil.show(ctx, title, body, (id == null ? "alarm" : id).hashCode(), taskOf(id), intent.getLongExtra("due", 0));
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
