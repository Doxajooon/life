package com.doxajooon.lifecontrol;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Reminders with the Jamal Life chime (res/raw/jamal_chime.wav) on a high-importance channel. */
public final class NotificationUtil {
    // A channel's sound can't be changed after creation, so the chime gets its own channel id.
    private static final String CHANNEL = "jamal_life_reminders";
    private static final String[] OLD_CHANNELS = {"life_control_v2", "life_control"};
    private static final long[] VIBRATION = {0, 180, 120, 180};
    private NotificationUtil() {}

    static Uri chimeUri(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + R.raw.jamal_chime);
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (String old : OLD_CHANNELS) { try { nm.deleteNotificationChannel(old); } catch (Exception ignored) {} }
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Задачи и этапы дня Jamal Life");
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRATION);
        ch.enableLights(true);
        ch.setLightColor(0xFF3FD0C9);
        ch.setSound(chimeUri(ctx), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(ch);
    }

    static void show(Context ctx, String title, String body, int id) { show(ctx, title, body, id, null); }

    /** taskId != null adds the buttons «Готово» and «Через 15 мин». */
    static void show(Context ctx, String title, String body, int id, String taskId) {
        ensureChannel(ctx);
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 999, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = body == null ? "" : body;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF3FD0C9)
                .setContentTitle(title == null ? "Jamal Life" : title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setSound(chimeUri(ctx))
                .setVibrate(VIBRATION);
        int nid = id == 0 ? (int) (System.currentTimeMillis() & 0x7fffffff) : id;
        if (taskId != null && !taskId.isEmpty()) {
            b.addAction(0, "Готово", action(ctx, ActionReceiver.DONE, taskId, nid, title, text));
            b.addAction(0, "Через 15 мин", action(ctx, ActionReceiver.SNOOZE, taskId, nid, title, text));
        }
        NotificationManagerCompat.from(ctx).notify(nid, b.build());
    }

    private static PendingIntent action(Context ctx, String act, String taskId, int nid, String title, String body) {
        Intent i = new Intent(ctx, ActionReceiver.class).setAction(act)
                .setData(Uri.parse("jamal://task/" + Uri.encode(taskId) + "/" + act))
                .putExtra("task", taskId).putExtra("nid", nid).putExtra("title", title).putExtra("body", body);
        return PendingIntent.getBroadcast(ctx, (act + taskId).hashCode() & 0x7fffffff, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
