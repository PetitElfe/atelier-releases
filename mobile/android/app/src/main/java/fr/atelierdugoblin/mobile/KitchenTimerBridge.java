package fr.atelierdugoblin.mobile;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;

/** Named user timers only. No polling service and no network access. */
public final class KitchenTimerBridge {
    static final Object LOCK = new Object();
    static final String PREFS = "goblin-kitchen-native-v1";
    private final Activity activity;
    KitchenTimerBridge(Activity activity) { this.activity=activity; }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE); }
    static boolean exact(Context c) { return Build.VERSION.SDK_INT<31 || ((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms(); }
    static PendingIntent pending(Context c,String id,long end) {
        Intent intent=new Intent(c,KitchenTimerReceiver.class).setAction("fr.atelierdugoblin.TIMER")
            .setData(Uri.parse("goblin-timer://alarm/"+Uri.encode(id))).putExtra("id",id).putExtra("end",end);
        return PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static File audio(Context c) { return new File(c.getFilesDir(),"goblin-kitchen-miam.audio"); }
    static String delivered(String id,long end) { return "fired:"+id+":"+end; }
    @JavascriptInterface public String status() {
        JSONObject out=new JSONObject();
        try { out.put("exact",exact(activity));out.put("notifications",((NotificationManager)activity.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled());out.put("audio",audio(activity).isFile());out.put("timers",new JSONArray(prefs(activity).getString("timers","[]"))); }
        catch(Exception e) { try{out.put("error","État des minuteurs indisponible");}catch(Exception ignored){} }
        return out.toString();
    }
    @JavascriptInterface public void requestExactPermission() {
        if(Build.VERSION.SDK_INT>=31&&!exact(activity))activity.runOnUiThread(()->{
            try{activity.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+activity.getPackageName())));}catch(Exception ignored){}
        });
    }
    @JavascriptInterface public boolean saveAudio(String base64) {
        if(base64==null||base64.length()>17000000)return false;
        synchronized(LOCK){
            File target=audio(activity),temp=new File(target.getPath()+".tmp");
            try{byte[] bytes=android.util.Base64.decode(base64,android.util.Base64.DEFAULT);if(bytes.length>12*1024*1024||bytes.length<12)return false;
                try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);out.flush();out.getFD().sync();}
                File original=new File(activity.getFilesDir(),"goblin-kitchen-original.audio");
                if(!original.exists()){try(java.io.FileInputStream in=new java.io.FileInputStream(temp);FileOutputStream out=new FileOutputStream(original)){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);out.flush();out.getFD().sync();}}
                return temp.renameTo(target);
            }catch(Exception e){temp.delete();return false;}
        }
    }
    @JavascriptInterface public String originalAudio() {try{File file=new File(activity.getFilesDir(),"goblin-kitchen-original.audio");if(!file.isFile()||file.length()>12*1024*1024)return "";return android.util.Base64.encodeToString(java.nio.file.Files.readAllBytes(file.toPath()),android.util.Base64.NO_WRAP);}catch(Exception e){return "";}}
    @JavascriptInterface public void acknowledge(String id,long end) {
        if(id==null||id.length()>120)return;
        synchronized(LOCK){prefs(activity).edit().putBoolean(delivered(id,end),true).commit();}
    }
    @JavascriptInterface public String sync(String raw) {
        try{syncTimers(activity,new JSONArray(raw));return status();}
        catch(Exception e){return "{\"error\":\"Les alarmes natives n’ont pas été enregistrées. Garde Goblin ouvert et vérifie ses autorisations.\"}";}
    }
    static void syncTimers(Context c,JSONArray incoming) throws Exception {
        synchronized(LOCK){
            if(incoming.length()>16)throw new IllegalArgumentException();
            JSONArray clean=new JSONArray();long now=System.currentTimeMillis();
            for(int i=0;i<incoming.length();i++){
                JSONObject t=incoming.getJSONObject(i);String id=t.getString("id"),label=t.optString("label","Cuisson");long end=t.getLong("end");
                if(!id.matches("[A-Za-z0-9_-]{1,120}")||label.length()>80||end<0||end>now+48L*60*60*1000)throw new IllegalArgumentException();
                clean.put(new JSONObject().put("id",id).put("label",label).put("end",end).put("running",t.optBoolean("running",false)).put("ringing",t.optBoolean("ringing",false)).put("sound",t.optBoolean("sound",true)));
            }
            SharedPreferences p=prefs(c);AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
            JSONArray old=new JSONArray(p.getString("timers","[]"));for(int i=0;i<old.length();i++){JSONObject t=old.getJSONObject(i);String oldId=t.getString("id");alarms.cancel(pending(c,oldId,t.getLong("end")));boolean active=false;for(int j=0;j<clean.length();j++){JSONObject current=clean.getJSONObject(j);if(current.getString("id").equals(oldId)&&(current.optBoolean("running")||current.optBoolean("ringing"))&&current.optBoolean("sound",true))active=true;}if(!active)KitchenTimerReceiver.stop(c,oldId);}
            boolean initial=!p.getBoolean("initialized",false);
            if(!p.edit().putString("timers",clean.toString()).putBoolean("initialized",true).commit())throw new IllegalStateException();
            for(int i=0;i<clean.length();i++){
                JSONObject t=clean.getJSONObject(i);String id=t.getString("id");long end=t.getLong("end");
                if(initial&&t.optBoolean("ringing")){p.edit().putBoolean(delivered(id,end),true).commit();continue;}
                if(!exact(c))continue;
                if((t.optBoolean("running")||t.optBoolean("ringing"))&&!p.getBoolean(delivered(id,end),false)){
                    if(end<=now){c.sendBroadcast(new Intent(c,KitchenTimerReceiver.class).setAction("fr.atelierdugoblin.TIMER").putExtra("id",id).putExtra("end",end));}
                    else alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,end,pending(c,id,end));
                }
            }
        }
    }
    static void resume(Context c) {
        try{syncTimers(c,new JSONArray(prefs(c).getString("timers","[]")));}catch(Exception ignored){}
    }
}
