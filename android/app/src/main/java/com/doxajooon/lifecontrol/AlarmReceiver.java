package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id"), kind = intent.getStringExtra("kind"), time = intent.getStringExtra("time");
        String title = intent.getStringExtra("title"), body = intent.getStringExtra("body");
        NotificationUtil.show(ctx, title, body, (id == null ? "alarm" : id).hashCode());
        if (id == null) return;
        if ("daily".equals(kind) && time != null) AlarmScheduler.schedule(ctx, id, time, title, body);
        else AlarmScheduler.fired(ctx, id, kind);
    }
}
