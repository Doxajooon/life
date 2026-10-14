package com.doxajooon.lifecontrol;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actions pressed in notifications while the app was closed; the web app takes them on start/resume. */
final class PendingActions {
    private static final String PREF = "jl_actions_v1", KEY = "list";
    private PendingActions() {}

    static synchronized void add(Context ctx, String action, String task) {
        SharedPreferences p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(p.getString(KEY, "[]"));
            JSONObject o = new JSONObject();
            o.put("a", action); o.put("task", task); o.put("at", System.currentTimeMillis());
            a.put(o);
            p.edit().putString(KEY, a.toString()).commit();
        } catch (Exception ignored) {}
    }

    static synchronized String take(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String v = p.getString(KEY, "[]");
        p.edit().remove(KEY).commit();
        return v;
    }
}
