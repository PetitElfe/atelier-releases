package fr.atelierdugoblin.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** A local copy only: no background connection and no undated tasks. */
public final class AgendaWidgetProvider extends AppWidgetProvider {
    public static final class Bridge {
        private final Context context;
        public Bridge(Context context){this.context=context;}
        @JavascriptInterface public boolean sync(String raw){
            try{
                if(raw==null||raw.length()>12000)return false;
                JSONObject data=new JSONObject(raw);JSONArray items=data.getJSONArray("items");
                if(items.length()>8)return false;
                for(int i=0;i<items.length();i++){
                    JSONObject item=items.getJSONObject(i);
                    if(item.getString("title").length()>240)return false;
                    LocalDate.parse(item.getString("date"));
                }
                context.getSharedPreferences("goblin-agenda-widget-v1",Context.MODE_PRIVATE).edit().putString("data",raw).apply();
                updateAll(context);return true;
            }catch(Exception e){return false;}
        }
        @JavascriptInterface public void clear(){context.getSharedPreferences("goblin-agenda-widget-v1",Context.MODE_PRIVATE).edit().clear().apply();updateAll(context);}
    }
    static void updateAll(Context c){AppWidgetManager m=AppWidgetManager.getInstance(c);int[] ids=m.getAppWidgetIds(new ComponentName(c,AgendaWidgetProvider.class));for(int id:ids)update(c,m,id);}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){for(int id:ids)update(c,manager,id);}
    private static void update(Context c,AppWidgetManager manager,int id){
        RemoteViews views=new RemoteViews(c.getPackageName(),R.layout.goblin_agenda_widget);
        StringBuilder text=new StringBuilder();String cycle="Goblin grognon · estimation indisponible";
        try{
            String raw=c.getSharedPreferences("goblin-agenda-widget-v1",Context.MODE_PRIVATE).getString("data","{}");JSONObject data=new JSONObject(raw);
            JSONArray items=data.optJSONArray("items");LocalDate today=LocalDate.now();int shown=0;
            if(items!=null)for(int n=0;n<items.length()&&shown<4;n++){
                JSONObject item=items.getJSONObject(n);long days=ChronoUnit.DAYS.between(today,LocalDate.parse(item.getString("date")));
                if(days<0&&"event".equals(item.optString("kind")))continue;
                if(shown++>0)text.append("\n");text.append(days<0?"En retard":days==0?"Aujourd’hui":"J−"+days).append(" · ").append(item.optString("time","")).append(" ").append(item.getString("title"));
            }
            JSONObject estimation=data.optJSONObject("cycle");
            if(estimation!=null){long days=ChronoUnit.DAYS.between(today,LocalDate.parse(estimation.getString("next_date")));cycle=days>=0?"Goblin grognon · J−"+days+" (estimé)":"Goblin grognon · actualise la copie";}
            if(data.optLong("updated",0)==0)text.append("Ouvre Goblin pour copier les échéances du PC.");
            else if(text.length()==0)text.append("Aucune échéance dans la dernière copie.");
        }catch(Exception e){text=new StringBuilder("Ouvre Goblin pour actualiser la copie du PC.");}
        views.setTextViewText(R.id.goblin_widget_items,text.toString());views.setTextViewText(R.id.goblin_widget_cycle,cycle);
        Intent open=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.goblin_widget_root,PendingIntent.getActivity(c,482,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(id,views);
    }
}
