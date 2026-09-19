package com.doxajooon.lifecontrol;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Calendar;

public final class AlarmScheduler {
    private static final String PREF = "lc_alarms";
    private AlarmScheduler() {}
    static int requestCode(String id) { return id.hashCode() & 0x7fffffff; }
    static void schedule(Context ctx, String id, String time, String title, String body) {
        String[] p = String.valueOf(time).split(":");
        if (p.length < 2) return;
        int hh, mm; try { hh=Integer.parseInt(p[0]); mm=Integer.parseInt(p[1]); } catch(Exception e){ return; }
        Calendar now=Calendar.getInstance(), at=Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY,hh); at.set(Calendar.MINUTE,mm); at.set(Calendar.SECOND,0); at.set(Calendar.MILLISECOND,0);
        if (!at.after(now)) at.add(Calendar.DAY_OF_YEAR,1);
        Intent i=new Intent(ctx,AlarmReceiver.class).setAction("LIFE_CONTROL_ALARM");
        i.putExtra("id",id); i.putExtra("time",String.format(java.util.Locale.US,"%02d:%02d",hh,mm)); i.putExtra("title",title); i.putExtra("body",body);
        PendingIntent pi=PendingIntent.getBroadcast(ctx,requestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE); if(am==null)return;
        if(Build.VERSION.SDK_INT>=31 && am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at.getTimeInMillis(),pi); else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at.getTimeInMillis(),pi);
        ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(id,hh+":"+mm+"|"+title+"|"+body).apply();
    }
    static void cancel(Context ctx,String id) {
        Intent i=new Intent(ctx,AlarmReceiver.class).setAction("LIFE_CONTROL_ALARM");
        PendingIntent pi=PendingIntent.getBroadcast(ctx,requestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE); if(am!=null)am.cancel(pi);
        ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(id).apply();
    }
    static void rescheduleAll(Context ctx){
        for(String id:ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).getAll().keySet()){
            String raw=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(id,""); if(raw==null)continue;
            String[] p=raw.split("\\|",3); if(p.length<3)continue; schedule(ctx,id,p[0],p[1],p[2]);
        }
    }
}
