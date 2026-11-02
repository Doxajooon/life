package com.doxajooon.lifecontrol;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * «Быстрый ввод» — a one-row home-screen widget with three buttons: expense, income, task.
 * Each opens its form in the app straight away (one tap from the home screen). It shows no data,
 * so there is nothing to refresh: the buttons are set once per widget.
 */
public class QuickWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick);
            v.setOnClickPendingIntent(R.id.q_expense, open(ctx, 711, JamalWidget.QUICK_EXPENSE));
            v.setOnClickPendingIntent(R.id.q_profit, open(ctx, 712, JamalWidget.QUICK_PROFIT));
            v.setOnClickPendingIntent(R.id.q_task, open(ctx, 713, JamalWidget.QUICK_TASK));
            mgr.updateAppWidget(id, v);
        }
    }

    private static PendingIntent open(Context ctx, int code, String action) {
        Intent i = new Intent(ctx, MainActivity.class).setAction(action)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
