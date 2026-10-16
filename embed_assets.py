from pathlib import Path
import re,base64
root=Path(__file__).resolve().parent
source=(root/'index.template.html').read_text(encoding='utf-8')
assets=root/'assets'
assert assets.exists(), 'Assets directory missing'
for match in set(re.findall(r'__ASSET_(\d\d)__',source)):
    files=list(assets.glob(match+'_*.png'))
    assert len(files)==1,(match,files)
    uri='data:image/png;base64,'+base64.b64encode(files[0].read_bytes()).decode('ascii')
    source=source.replace('__ASSET_'+match+'__',uri)
assert '__ASSET_' not in source
(root/'index.html').write_text(source,encoding='utf-8')
print('Generated index.html')
