package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;

/**
 * Buttons on a task reminder:
 *  «Готово»        — remembered until the app opens (the web app marks the task done and syncs it),
 *                    all remaining alarms of that task are cancelled right away;
 *  «Через 15 мин»  — the same reminder rings again in 15 minutes, even if the app is closed.
 */
public class ActionReceiver extends BroadcastReceiver {
    static final String DONE = "com.doxajooon.lifecontrol.TASK_DONE";
    static final String SNOOZE = "com.doxajooon.lifecontrol.TASK_SNOOZE";
    static final long SNOOZE_MS = 15 * 60_000L;

    @Override public void onReceive(Context ctx, Intent i) {
        String task = i.getStringExtra("task");
        if (task == null || task.isEmpty()) return;
        NotificationManagerCompat.from(ctx).cancel(i.getIntExtra("nid", 0));
        if (DONE.equals(i.getAction())) {
            PendingActions.add(ctx, "done", task);
            AlarmScheduler.cancelTask(ctx, task);
            JamalWidget.markDone(ctx, task);
            MainActivity.deliverActions();
        } else if (SNOOZE.equals(i.getAction())) {
            String title = i.getStringExtra("title"), body = i.getStringExtra("body");
            AlarmScheduler.scheduleOnce(ctx, "tasksnz_" + task, System.currentTimeMillis() + SNOOZE_MS,
                    title == null ? "Напоминание" : title, "Отложено на 15 минут" + (body == null || body.isEmpty() ? "" : " · " + body));
        }
    }
}
