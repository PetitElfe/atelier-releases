# Run locally as the repository owner. No artwork is sent to a chat or committed to git.
$ErrorActionPreference='Stop'
trap{Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Publication de l’icône')|Out-Null;exit 1}
$repo='PetitElfe/atelier-releases'
if(-not(Get-Command gh -ErrorAction SilentlyContinue)){throw 'Installe GitHub CLI, puis connecte ton compte PetitElfe avec gh auth login. Relance ensuite ce fichier.'}
& gh auth status
if($LASTEXITCODE -ne 0){throw 'Connecte ton compte avec gh auth login.'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='Image PNG (*.png)|*.png';$dialog.Title='Icône officielle distribuée avec L’Atelier'
if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){exit}
if([Windows.Forms.MessageBox]::Show('Une copie de ton icône sera publiée sur GitHub et distribuée avec L’Atelier. Ton dessin ne sera pas envoyé dans ChatGPT. Continuer ?','Icône officielle','YesNo') -ne 'Yes'){exit}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('atelier-brand-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($temp)|Out-Null
try{
 $source=[Drawing.Image]::FromFile($dialog.FileName)
 try{
  if((Get-Item -LiteralPath $dialog.FileName).Length -gt 16777216 -or $source.Width -gt 8192 -or $source.Height -gt 8192){throw 'PNG trop grand. Exporte une icône carrée de 1024 px.'}
  $bitmap=New-Object Drawing.Bitmap(1024,1024,[Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=[Drawing.Graphics]::FromImage($bitmap)
  try{$g.Clear([Drawing.Color]::Transparent);$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$ratio=[Math]::Min(1024/$source.Width,1024/$source.Height);$w=[int]($source.Width*$ratio);$h=[int]($source.Height*$ratio);$g.DrawImage($source,[int]((1024-$w)/2),[int]((1024-$h)/2),$w,$h);$png=Join-Path $temp 'prepared.png';$bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bitmap.Dispose()}
 }finally{$source.Dispose()}
 $ico=Join-Path $temp 'prepared.ico'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '../app/local_icon.ps1') -Mode ImportTest -InputPng $png -OutputIcon $ico
 if($LASTEXITCODE -ne 0){throw 'Conversion ICO impossible.'}
 $pngHash=(Get-FileHash $png -Algorithm SHA256).Hash.ToLower();$icoHash=(Get-FileHash $ico -Algorithm SHA256).Hash.ToLower()
 $pngName='icon-'+$pngHash+'.png';$icoName='icon-'+$icoHash+'.ico';Rename-Item $png $pngName;Rename-Item $ico $icoName
 $meta=Join-Path $temp 'icon.json';@{png_sha256=$pngHash;ico_sha256=$icoHash}|ConvertTo-Json|Set-Content $meta -Encoding ascii
 & gh release view atelier-official-icon --repo $repo 2>$null|Out-Null
 if($LASTEXITCODE -ne 0){& gh release create atelier-official-icon --repo $repo --prerelease --title 'Icône officielle de L’Atelier' --notes 'Image publiée directement par sa créatrice, sans dépôt du dessin dans un chat.'}
 if($LASTEXITCODE -ne 0){throw 'Création de la publication impossible.'}
 & gh release upload atelier-official-icon (Join-Path $temp $pngName) (Join-Path $temp $icoName) --repo $repo --clobber
 if($LASTEXITCODE -ne 0){throw 'Envoi des icônes impossible.'}
 & gh release upload atelier-official-icon $meta --repo $repo --clobber
 if($LASTEXITCODE -ne 0){throw 'Publication des empreintes impossible.'}
 # Rebuild the Android package from the most recent tested release, never from main.
 $releases=(& gh api "repos/$repo/releases?per_page=100"|ConvertFrom-Json)
 $latest=$releases|Where-Object {$_.tag_name -match '^android-test-v\d+\.\d+\.\d+$'}|Sort-Object {[version]($_.tag_name -replace '^android-test-v','')} -Descending|Select-Object -First 1
 if(-not $latest){throw 'Version Android TEST introuvable.'}
 $commit=(& gh api "repos/$repo/commits/$($latest.tag_name)"|ConvertFrom-Json)
 $treeBody=@{base_tree=$commit.commit.tree.sha;tree=@(@{path='.branding/request.txt';mode='100644';type='blob';content=([DateTime]::UtcNow.ToString('o')+' '+$pngHash)})}|ConvertTo-Json -Depth 8
 $tree=($treeBody|& gh api "repos/$repo/git/trees" --method POST --input -|ConvertFrom-Json)
 $commitBody=@{message='Rebuild official Android icon from tested release';tree=$tree.sha;parents=@($commit.sha)}|ConvertTo-Json
 $next=($commitBody|& gh api "repos/$repo/git/commits" --method POST --input -|ConvertFrom-Json)
 if(-not $next.sha){throw 'Préparation Android impossible.'}
 & gh api "repos/$repo/git/ref/heads/test/official-icon-android" 2>$null|Out-Null
 if($LASTEXITCODE -ne 0){@{ref='refs/heads/test/official-icon-android';sha=$commit.sha}|ConvertTo-Json|& gh api "repos/$repo/git/refs" --method POST --input -|Out-Null}
 @{sha=$next.sha;force=$true}|ConvertTo-Json|& gh api "repos/$repo/git/refs/heads/test/official-icon-android" --method PATCH --input -|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Relance de la compilation Android impossible. Les icônes PC sont publiées.'}
 [Windows.Forms.MessageBox]::Show('Icône publiée. Les PC la récupéreront au prochain démarrage ou dans l’heure. La prochaine mise à jour Android signée se prépare automatiquement.','L’Atelier')|Out-Null
}finally{Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
