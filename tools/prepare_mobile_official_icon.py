"""Build launch icons locally in CI from the creator-published verified asset."""
from pathlib import Path
from io import BytesIO
from PIL import Image,ImageOps
import official_icon_source

def prepare(root,png):
 image=Image.open(BytesIO(png)).convert('RGBA')
 if image.width>2048 or image.height>2048:raise ValueError('Official icon dimensions too large')
 for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
  folder=root/'res'/('mipmap-'+density);folder.mkdir(parents=True,exist_ok=True)
  ImageOps.pad(image,(size,size),method=Image.Resampling.LANCZOS,color=(0,0,0,0)).save(folder/'ic_launcher.png')
 path=root/'AndroidManifest.xml';text=path.read_text()
 if 'android:icon=' not in text:text=text.replace('<application ','<application android:icon="@mipmap/ic_launcher" ',1)
 path.write_text(text)

if __name__=='__main__':
 m=official_icon_source.metadata();prepare(Path('mobile/android/app/src/main'),official_icon_source.asset(m,'png'))
 print('Verified official icon prepared for every Android density')
