package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id"), kind = intent.getStringExtra("kind"), time = intent.getStringExtra("time");
        String title = intent.getStringExtra("title"), body = intent.getStringExtra("body");
        NotificationUtil.show(ctx, title, body, (id == null ? "alarm" : id).hashCode(), taskOf(id));
        if (id == null) return;
        if ("daily".equals(kind) && time != null) AlarmScheduler.schedule(ctx, id, time, title, body);
        else AlarmScheduler.fired(ctx, id, kind);
    }

    /** task_<id>, taskpre_<id>, tasksnz_<id> → <id>; other alarms have no buttons. */
    static String taskOf(String id) {
        if (id == null) return null;
        if (id.startsWith("task_")) return id.substring(5);
        if (id.startsWith("taskpre_") || id.startsWith("tasksnz_")) return id.substring(8);
        return null;
    }
}
