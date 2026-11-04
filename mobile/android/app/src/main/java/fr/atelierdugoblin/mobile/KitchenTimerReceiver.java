package fr.atelierdugoblin.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class KitchenTimerReceiver extends BroadcastReceiver {
    private static final java.util.concurrent.ConcurrentHashMap<String,MediaPlayer> players=new java.util.concurrent.ConcurrentHashMap<>();
    static void stop(Context c,String id){MediaPlayer player=players.remove(id);if(player!=null)try{player.stop();}catch(Exception ignored){}((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel("kitchen:"+id,0);}

    @Override public void onReceive(Context context,Intent intent) {
        if(!"fr.atelierdugoblin.TIMER".equals(intent.getAction())){KitchenTimerBridge.resume(context);return;}
        String id=intent.getStringExtra("id");long end=intent.getLongExtra("end",-1);JSONObject timer=null;
        synchronized(KitchenTimerBridge.LOCK){
            try{JSONArray timers=new JSONArray(KitchenTimerBridge.prefs(context).getString("timers","[]"));for(int i=0;i<timers.length();i++){JSONObject t=timers.getJSONObject(i);if(t.getString("id").equals(id)&&t.getLong("end")==end&&(t.optBoolean("running")||t.optBoolean("ringing")))timer=t;}
                if(timer==null||end>System.currentTimeMillis()+1000||KitchenTimerBridge.prefs(context).getBoolean(KitchenTimerBridge.delivered(id,end),false))return;
                if(!KitchenTimerBridge.prefs(context).edit().putBoolean(KitchenTimerBridge.delivered(id,end),true).commit())return;
            }catch(Exception e){return;}
        }
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel=new NotificationChannel("goblin-kitchen-v1","Minuteurs de cuisine",NotificationManager.IMPORTANCE_HIGH);
        // Play only the actual imported Miam clip; never substitute a different tone.
        channel.setSound(null,null);channel.enableVibration(true);manager.createNotificationChannel(channel);
        Intent open=new Intent(context,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(context,"goblin-kitchen-v1").setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Minuteur terminé").setContentText(timer.optString("label","Cuisson")).setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(content).setAutoCancel(true).build();
        try{manager.notify("kitchen:"+id,0,notification);}catch(SecurityException ignored){}
        final boolean sound=timer.optBoolean("sound",true);final File clip=KitchenTimerBridge.audio(context);
        if(!sound||!clip.isFile())return;
        final PendingResult result=goAsync();
        new Thread(()->{
            MediaPlayer player=new MediaPlayer();
            try{player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                player.setWakeMode(context,PowerManager.PARTIAL_WAKE_LOCK);player.setDataSource(clip.getAbsolutePath());player.prepare();
                CountDownLatch done=new CountDownLatch(1);player.setOnCompletionListener(p->done.countDown());player.setOnErrorListener((p,w,e)->{done.countDown();return true;});players.put(id,player);player.start();done.await(7,TimeUnit.SECONDS);
            }catch(Exception ignored){}finally{try{player.stop();}catch(Exception ignored){}players.remove(id,player);player.release();result.finish();}
        },"GoblinKitchenAlarm").start();
    }
}
