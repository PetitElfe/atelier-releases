"""Bundle the reviewed shared studio into the offline Android HTML."""
from pathlib import Path
import argparse
import re
ROOT=Path(__file__).resolve().parents[1]

def build(shared=None):
    target=ROOT/'mobile/prototype'
    if shared:
        source=Path(shared)
        for name in ('studio_core.js','studio_album.js','studio.css'):
            (target/name).write_text((source/name).read_text())
        cards=(source/'studio_tools.js').read_text().split(' function cardForm(',1)[0]+'\n})();\n'
        (target/'studio_cards.js').write_text(cards)
    path=target/'index.html';html=path.read_text()
    styles='<style id="studioMobileStyles">\n'+(target/'studio.css').read_text()+'\n'+(target/'studio_mobile.css').read_text()+'\n'+(target/'grounding_cards.css').read_text()+'\n</style>'
    if 'id="studioMobileStyles"' in html:html=re.sub(r'<style id="studioMobileStyles">.*?</style>',lambda _:styles,html,flags=re.S)
    else:html=html.replace('</head>',styles+'\n</head>')
    names=('studio_mobile_transport.js','studio_core.js','studio_album.js','studio_cards.js','grounding_cards.js','studio_mobile_ui.js')
    script='/* STUDIO_MOBILE_EXTENSION_START */\n'+'\n'.join((target/n).read_text() for n in names)+'\n/* STUDIO_MOBILE_EXTENSION_END */'
    if '/* STUDIO_MOBILE_EXTENSION_START */' in html:html=re.sub(r'/\* STUDIO_MOBILE_EXTENSION_START \*/.*?/\* STUDIO_MOBILE_EXTENSION_END \*/',lambda _:script,html,flags=re.S)
    else:html=html.replace('</script>',script+'\n</script>')
    grocery_styles='<style id="groceryStyles">'+(target/'groceries.css').read_text()+"\nbody.shopping-focus header{min-height:56px;height:auto;padding:8px 14px}body.shopping-focus .paper{padding-top:12px}body.shopping-focus #title,body.shopping-focus #subtitle{display:none}.shopping-focus .grocery-row input{min-height:40px;font-size:16px}.shopping-focus .grocery-tabs button{min-height:40px}.shopping-focus .grocery-app{padding-bottom:12px}\n</style>"
    if 'id="groceryStyles"' in html:html=re.sub(r'<style id="groceryStyles">.*?</style>',lambda _:grocery_styles,html,flags=re.S)
    else:html=html.replace('</head>',grocery_styles+'\n</head>')
    groceries='/* GROCERY_EXTENSION_START */\n'+(target/'groceries_ui.js').read_text()+'\n'+(target/'groceries_mobile.js').read_text()+'\n/* GROCERY_EXTENSION_END */'
    if '/* GROCERY_EXTENSION_START */' in html:html=re.sub(r'/\* GROCERY_EXTENSION_START \*/.*?/\* GROCERY_EXTENSION_END \*/',lambda _:groceries,html,flags=re.S)
    else:html=html.replace('</script>',groceries+'\n</script>')
    utility='/* UTILITY_SYNC_EXTENSION_START */\n'+(target/'utility_sync_extension.js').read_text()+'\n/* UTILITY_SYNC_EXTENSION_END */'
    html=re.sub(r'/\* UTILITY_SYNC_EXTENSION_START \*/.*?/\* UTILITY_SYNC_EXTENSION_END \*/',lambda _:utility,html,flags=re.S)
    chrome_style='<style id="mobileChromeStyles">'+(target/'mobile_chrome.css').read_text()+'</style>'
    if 'id="mobileChromeStyles"' in html:html=re.sub(r'<style id="mobileChromeStyles">.*?</style>',lambda _:chrome_style,html,flags=re.S)
    else:html=html.replace('</head>',chrome_style+'\n</head>')
    chrome='/* MOBILE_CHROME_START */\n'+(target/'mobile_chrome.js').read_text()+'\n/* MOBILE_CHROME_END */'
    if '/* MOBILE_CHROME_START */' in html:html=re.sub(r'/\* MOBILE_CHROME_START \*/.*?/\* MOBILE_CHROME_END \*/',lambda _:chrome,html,flags=re.S)
    else:html=html.replace('</script>',chrome+'\n</script>')
    path.write_text(html)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--shared-source');args=parser.parse_args();build(args.shared_source)
