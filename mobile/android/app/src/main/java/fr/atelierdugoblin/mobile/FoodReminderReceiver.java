package fr.atelierdugoblin.mobile;
import android.app.*;import android.content.*;import android.os.Build;import java.util.*;
public final class FoodReminderReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent i){if(!"fr.atelierdugoblin.FOOD".equals(i.getAction())){FoodReminderBridge.resume(c);return;}
 String name=i.getStringExtra("name");int days=i.getIntExtra("days",0);String key=i.getData().getPathSegments().get(0);Set<String> delivered=new HashSet<>(FoodReminderBridge.prefs(c).getStringSet("delivered",new HashSet<>()));delivered.add(key+":"+days);FoodReminderBridge.prefs(c).edit().putStringSet("delivered",delivered).commit();
 NotificationManager n=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);String channel="goblin_food_expiry_v1";if(Build.VERSION.SDK_INT>=26)n.createNotificationChannel(new NotificationChannel(channel,"Aliments à consommer",NotificationManager.IMPORTANCE_DEFAULT));
 Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("groceries_inventory",true);PendingIntent tap=PendingIntent.getActivity(c,811,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 try{n.notify((key+":"+days).hashCode(),new Notification.Builder(c,channel).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(name).setContentText(days==0?"À consommer aujourd’hui":"À consommer dans "+days+" jours").setContentIntent(tap).setAutoCancel(true).build());}catch(SecurityException ignored){}FoodReminderBridge.resume(c);
 }
}
