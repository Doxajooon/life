package com.doxajooon.lifecontrol;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String id=intent.getStringExtra("id"), time=intent.getStringExtra("time"), title=intent.getStringExtra("title"), body=intent.getStringExtra("body");
        NotificationUtil.show(ctx,title,body,(id==null?"alarm":id).hashCode());
        if(id!=null && time!=null) AlarmScheduler.schedule(ctx,id,time,title,body);
    }
}
