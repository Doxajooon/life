package com.doxajooon.lifecontrol;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Reminders with the Dawn sound (res/raw/jamal_dawn.wav, made by tools/make-dawn.py) on a high-importance channel.
 * 74.1: «Громкие напоминания» (on by default) put the sound on the alarm stream (USAGE_ALARM), so it is heard even when
 * the ringer is quiet; switched off, the reminders use the notification stream as before (USAGE_NOTIFICATION_EVENT).
 * A channel's sound and usage can't be changed after creation, so each mode has its own channel id.
 */
public final class NotificationUtil {
    static final String CHANNEL = "jamal_life_dawn3";        // loud: alarm volume (74.6: the short soft chime, rings once)
    static final String CHANNEL_SOFT = "jamal_life_dawn3_soft"; // quiet: notification volume
    /** 74.7: the hourly reminder (every 1 h inside the day): soft nature sound, no vibration, rings once */
    static final String CHANNEL_NATURE = "jamal_life_nature1";
    private static final String[] OLD_CHANNELS = {"jamal_life_dawn", "jamal_life_dawn2", "jamal_life_dawn2_soft", "jamal_life_glass", "jamal_life_glow", "jamal_life_reminders", "life_control_v2", "life_control"};
    private static final long[] VIBRATION = {0, 180, 120, 180};
    private NotificationUtil() {}

    static Uri chimeUri(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + R.raw.jamal_dawn);
    }

    /** «Громкие напоминания (как будильник)» — kept on the device, so alarms that ring with the app closed know it. */
    static boolean isLoud(Context ctx) {
        return ctx.getSharedPreferences("lc_ui", Context.MODE_PRIVATE).getBoolean("loud", true);
    }

    static void setLoud(Context ctx, boolean on) {
        ctx.getSharedPreferences("lc_ui", Context.MODE_PRIVATE).edit().putBoolean("loud", on).apply();
    }

    static String channel(Context ctx) { return isLoud(ctx) ? CHANNEL : CHANNEL_SOFT; }

    static Uri natureUri(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + R.raw.jamal_nature);
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (String old : OLD_CHANNELS) { try { nm.deleteNotificationChannel(old); } catch (Exception ignored) {} }
        String about = "Задачи и этапы дня · " + ctx.getString(R.string.app_name);
        make(ctx, nm, CHANNEL, "Напоминания (громко, как будильник)", about, AudioAttributes.USAGE_ALARM);
        make(ctx, nm, CHANNEL_SOFT, "Напоминания (обычная громкость)", about, AudioAttributes.USAGE_NOTIFICATION_EVENT);
        makeNature(ctx, nm);
    }

    private static void makeNature(Context ctx, NotificationManager nm) {
        String about = "Раз в час: звук природы · " + ctx.getString(R.string.app_name);
        if (nm.getNotificationChannel(CHANNEL_NATURE) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_NATURE, "Раз в час (природа)", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(about);
        ch.enableVibration(false);
        ch.setSound(natureUri(ctx), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(ch);
    }

    private static void make(Context ctx, NotificationManager nm, String id, String name, String about, int usage) {
        NotificationChannel had = nm.getNotificationChannel(id);
        if (had != null) {
            // same id, so the sound and the user's settings stay; only the visible description follows the app name
            if (!about.equals(had.getDescription())) { had.setDescription(about); nm.createNotificationChannel(had); }
            return;
        }
        NotificationChannel ch = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(about);
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRATION);
        ch.enableLights(true);
        ch.setLightColor(0xFF22C55E);
        ch.setSound(chimeUri(ctx), new AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(ch);
    }

    static void show(Context ctx, String title, String body, int id) { show(ctx, title, body, id, null, 0); }
    static void show(Context ctx, String title, String body, int id, String taskId) { show(ctx, title, body, id, taskId, 0); }

    private static final String[] MOTIVATION = {
            "💪 Начни прямо сейчас — первые 5 минут решают всё",
            "🔥 Маленький шаг сегодня — большая победа через месяц",
            "🎯 Сделай главное, пока голова свежая",
            "⚡ Не жди настроения — действие рождает настроение",
            "👑 Ты управляешь днём, а не день тобой",
            "🌱 Постоянство важнее силы — просто сделай",
            "🏆 Каждое выполненное дело приближает к цели"
    };

    private static RemoteViews content(Context ctx, String title, String text, boolean big) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.notif_reminder);
        v.setTextViewText(R.id.n_title, title);
        v.setTextViewText(R.id.n_body, text);
        v.setTextViewText(R.id.n_motiv, MOTIVATION[(int) ((System.currentTimeMillis() / 60000) % MOTIVATION.length)]);
        int day = JamalWidget.dayProgress(ctx);
        if (big && day >= 0) {
            v.setProgressBar(R.id.n_day, 100, day, false);
            v.setTextViewText(R.id.n_day_txt, "день " + day + "%");
        } else v.setViewVisibility(R.id.n_day_row, View.GONE);
        if (!big) v.setViewVisibility(R.id.n_motiv_row, View.GONE);
        return v;
    }

    private static Bitmap largeIcon;
    private static Bitmap appIcon(Context ctx) {
        if (largeIcon != null) return largeIcon;
        try {
            Drawable d = ctx.getPackageManager().getApplicationIcon(ctx.getPackageName());
            int px = (int) (64 * ctx.getResources().getDisplayMetrics().density);
            Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b); d.setBounds(0, 0, px, px); d.draw(c);
            largeIcon = b;
        } catch (Exception ignored) {}
        return largeIcon;
    }

    /**
     * taskId != null adds the buttons «Готово» and «Через 15 мин».
     * dueAt > now shows a live countdown to the task time on the lock screen.
     */
    static void show(Context ctx, String title, String body, int id, String taskId, long dueAt) {
        show(ctx, title, body, id, taskId, dueAt, false);
    }

    /** 75.0: quiet hours — from 19:00 to 06:30 no reminder is shown or heard. */
    static final int QUIET_FROM_MIN = 19 * 60, QUIET_TO_MIN = 6 * 60 + 30;
    static boolean quietNow() {
        java.util.Calendar c = java.util.Calendar.getInstance();
        int m = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE);
        return m >= QUIET_FROM_MIN || m < QUIET_TO_MIN;
    }

    /** 75.0: the phone is on silent or vibrate — the reminder is not shown (USAGE_ALARM would otherwise ring through silent). */
    static boolean silentNow(Context ctx) {
        android.media.AudioManager am = (android.media.AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        return am != null && am.getRingerMode() != android.media.AudioManager.RINGER_MODE_NORMAL;
    }

    static boolean blocked(Context ctx) { return quietNow() || silentNow(ctx); }

    static void show(Context ctx, String title, String body, int id, String taskId, long dueAt, boolean nature) {
        show(ctx, title, body, id, taskId, dueAt, nature, false);
    }

    /** force = true only for the user's own «Проверить звук» preview. */
    static void show(Context ctx, String title, String body, int id, String taskId, long dueAt, boolean nature, boolean force) {
        if (!force && blocked(ctx)) return;
        ensureChannel(ctx);
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 999, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = body == null ? "" : body;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, nature ? CHANNEL_NATURE : channel(ctx))
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF22C55E)
                .setLargeIcon(appIcon(ctx))
                .setSubText(taskId != null && taskId.startsWith("debtpay:") ? "Деньги" : taskId != null && !taskId.startsWith("stage:") ? "Задача" : "Ритм дня")
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentTitle(title == null ? ctx.getString(R.string.app_name) : title)
                .setContentText(text)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(content(ctx, title == null ? ctx.getString(R.string.app_name) : title, text, false))
                .setCustomBigContentView(content(ctx, title == null ? ctx.getString(R.string.app_name) : title, text, true))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOnlyAlertOnce(false) // a repeated reminder («Через 15 мин») rings again
                .setSound(nature ? natureUri(ctx) : chimeUri(ctx));
        if (!nature) b.setVibrate(VIBRATION);
        if (dueAt > System.currentTimeMillis()) {
            b.setWhen(dueAt).setShowWhen(true).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
        }
        int nid = id == 0 ? (int) (System.currentTimeMillis() & 0x7fffffff) : id;
        if (taskId != null && !taskId.isEmpty()) {
            boolean stage = taskId.startsWith("stage:"); // «Этап заканчивается. Сделал главное?»
            if (taskId.startsWith("debtpay:")) {
                // 74.5: salary day — one button «Отложил», the web app writes the debt payment
                b.addAction(0, "Отложил", action(ctx, ActionReceiver.DONE, taskId, nid, title, text, dueAt));
            } else {
                b.addAction(0, stage ? "Да" : "Готово", action(ctx, ActionReceiver.DONE, taskId, nid, title, text, dueAt));
                b.addAction(0, stage ? "Перенести" : "Через 15 мин", action(ctx, ActionReceiver.SNOOZE, taskId, nid, title, text, dueAt));
            }
        }
        NotificationManagerCompat.from(ctx).notify(nid, b.build());
    }

    private static PendingIntent action(Context ctx, String act, String taskId, int nid, String title, String body, long due) {
        Intent i = new Intent(ctx, ActionReceiver.class).setAction(act)
                .setData(Uri.parse("jamal://task/" + Uri.encode(taskId) + "/" + act))
                .putExtra("task", taskId).putExtra("nid", nid).putExtra("title", title).putExtra("body", body).putExtra("due", due);
        return PendingIntent.getBroadcast(ctx, (act + taskId + ':' + nid).hashCode() & 0x7fffffff, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
