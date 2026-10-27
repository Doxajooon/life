package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are wiped by a reboot or an app update: restore every saved reminder. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { AlarmScheduler.rescheduleAll(context); }
}
