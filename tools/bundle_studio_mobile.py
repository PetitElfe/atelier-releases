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
    path.write_text(html)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--shared-source');args=parser.parse_args();build(args.shared_source)
