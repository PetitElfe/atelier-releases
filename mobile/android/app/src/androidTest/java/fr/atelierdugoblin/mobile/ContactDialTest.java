package fr.atelierdugoblin.mobile;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
/** Intercepts the dial intent, so this test never places a call. */
@RunWith(AndroidJUnit4.class)
public class ContactDialTest {
 @Test public void contactOpensDiallerWithoutCalling() throws Exception {
  Instrumentation inst=InstrumentationRegistry.getInstrumentation();
  AtomicReference<Intent> dial=new AtomicReference<>();
  Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(){
   @Override public Instrumentation.ActivityResult onStartActivity(Intent intent){
    if(Intent.ACTION_DIAL.equals(intent.getAction())){dial.set(intent);return new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null);}
    return null;
   }
  };
  inst.addMonitor(monitor);
  MainActivity activity=(MainActivity)inst.startActivitySync(new Intent(inst.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try {
   Field field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);WebView web=(WebView)field.get(activity);
   Thread.sleep(3000);
   inst.runOnMainSync(()->web.evaluateJavascript("(()=>{const a=document.createElement('a');a.href='tel:0561000000';document.body.append(a);a.click()})()",null));
   for(int i=0;i<100&&dial.get()==null;i++)Thread.sleep(100);
   assertNotNull("Contact must open the native dialler",dial.get());
   assertEquals(Intent.ACTION_DIAL,dial.get().getAction());
   assertEquals("tel:0561000000",dial.get().getDataString());
   String[] permissions=inst.getTargetContext().getPackageManager().getPackageInfo(inst.getTargetContext().getPackageName(),android.content.pm.PackageManager.GET_PERMISSIONS).requestedPermissions;
   if(permissions!=null)for(String permission:permissions)assertNotEquals("android.permission.CALL_PHONE",permission);
  } finally {inst.removeMonitor(monitor);inst.runOnMainSync(activity::finish);}
 }
}
