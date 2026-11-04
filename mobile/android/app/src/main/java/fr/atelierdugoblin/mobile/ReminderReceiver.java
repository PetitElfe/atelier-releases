package fr.atelierdugoblin.mobile;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import org.json.*;

public final class ReminderReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent intent){String action=intent.getAction();if(!"fr.atelierdugoblin.REMINDER".equals(action)&&!"fr.atelierdugoblin.REMINDER_ACTION".equals(action)){ReminderBridge.resume(c);return;}String id=intent.getStringExtra("id");long end=intent.getLongExtra("end",-1);
  try{if("fr.atelierdugoblin.REMINDER_ACTION".equals(action)){String choice=intent.getStringExtra("choice");if(choice!=null&&choice.matches("finish|done|10|30|60"))ReminderBridge.queue(c,id,end,choice);return;}
   synchronized(ReminderBridge.LOCK){SharedPreferences p=ReminderBridge.prefs(c);if(!p.getBoolean("enabled",false)||p.getBoolean("sent:"+id+":"+end,false)||end<=0||end>System.currentTimeMillis()+1000)return;JSONObject selected=null;JSONArray rows=new JSONArray(p.getString("reminders","[]"));for(int n=0;n<rows.length();n++){JSONObject r=rows.getJSONObject(n);if(r.getString("id").equals(id)&&r.getLong("end")==end)selected=r;}if(selected==null)return;
    NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(!manager.areNotificationsEnabled()){p.edit().putString("error","Notifications refusées : des rappels restent en attente.").commit();return;}
    NotificationChannel channel=new NotificationChannel("goblin-reminders-v1","Rendez-vous et tâches",NotificationManager.IMPORTANCE_HIGH);channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());manager.createNotificationChannel(channel);
    Intent open=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);PendingIntent content=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=new Notification.Builder(c,"goblin-reminders-v1").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Rappel Goblin").setContentText(selected.optString("title","Rappel")).setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_REMINDER).setContentIntent(content).setAutoCancel(false);
    String[][] choices={{"finish","Terminer"},{"10","10 min"},{"30","30 min"},{"60","1 heure"},{"done","Annuler"}};
    for(String[] choice:choices){Intent i=new Intent(c,ReminderReceiver.class).setAction("fr.atelierdugoblin.REMINDER_ACTION").setData(Uri.parse("goblin-reminder://action/"+Uri.encode(id)+"/"+end+"/"+choice[0])).putExtra("id",id).putExtra("end",end).putExtra("choice",choice[0]);PendingIntent pi=PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);builder.addAction(new Notification.Action.Builder(null,choice[1],pi).build());}
    manager.notify("reminder:"+id,0,builder.build());p.edit().putBoolean("sent:"+id+":"+end,true).putString("error","").commit();
   }
  }catch(Exception e){ReminderBridge.prefs(c).edit().putString("error","Une action de rappel reste à vérifier dans Goblin.").commit();}
 }
}
