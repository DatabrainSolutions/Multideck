"""Check catalogue coverage, editable tags, safe fixtures and repeatable layouts."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

ROOT=Path(__file__).resolve().parent
RENDERER=Path('/Users/leewright/.codex/plugins/cache/openai-primary-runtime/documents/26.921.10847/skills/documents/render_docx.py')

def tags(path):
    with ZipFile(path) as archive:
        text='\n'.join(''.join(etree.fromstring(archive.read(name)).xpath('//w:t/text()',namespaces={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})) for name in archive.namelist() if name.startswith('word/') and name.endswith('.xml'))
    return re.findall(r'\{d\.[^{}]+\}',text),text

def validate():
    manifest=json.loads((ROOT/'catalogue-crosswalk.json').read_text())
    assert len(manifest['crosswalk'])==189
    assert {r['row'] for r in manifest['crosswalk']}==set(range(6,195))
    assert len({t['code'] for t in manifest['templates']})==len(manifest['templates'])
    for item in manifest['templates']:
        assert hashlib.sha256((ROOT/item['file']).read_bytes()).hexdigest()==item['sha256'],item['code']
        paths,text=tags(ROOT/item['file'])
        assert paths and '{{' not in text
        data=json.loads((ROOT/'samples'/(item['code']+'.json')).read_text())
        for tag in paths:
            path=tag[3:-1]
            if '[i+1]' in path: continue
            value=data
            for part in path.split('.'):
                if part.endswith('[i]'): value=value[part[:-3]][0]
                else: value=value[part]
            assert isinstance(value,str),(item['code'],path)
        arrays={p[3:].split('[i]')[0] for p in paths if '[i]' in p}
        assert all('{d.'+arr+'[i+1]}' in paths for arr in arrays)
        assert item['status']=='draft' and item['wiringStatus']=='not wired'
        assert 'CUS000' not in text and 'Jenkar' not in text
    trade=json.loads((ROOT/'samples'/'CATALOGUE_COMMERCIAL_INVOICE_SOURCE.json').read_text())['document']
    assert trade['totals']['total']=='GBP 8,000.00'
    assert trade['tradeLines'][0]['amount']==trade['totals']['net']
    loading=json.loads((ROOT/'samples'/'CATALOGUE_LOADING_MANIFEST.json').read_text())['document']
    assert len(loading['allocations'])==len(loading['equipment'])==2
    assert all(e['loadedGrossKg']==e['vgmKg']=='Not recorded' for e in loading['equipment'])
    print(f"PASS: {len(manifest['templates'])} Word templates, fixture paths and loop markers; all 189 catalogue rows accounted for.",flush=True)

def render(path):
    output=ROOT/'qa-renders'/path.parent.name/path.stem
    result=subprocess.run([sys.executable,str(RENDERER),str(path),'--output_dir',str(output),'--emit_pdf'],capture_output=True,text=True)
    if result.returncode: raise RuntimeError(path.name+'\n'+result.stdout+'\n'+result.stderr)
    pages=list(output.glob('page-*.png'))
    if not pages: raise RuntimeError('No page images: '+path.name)
    return {'file':str(path.relative_to(ROOT)),'pages':len(pages),'directory':str(output.relative_to(ROOT))}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--render',action='store_true');args=p.parse_args()
    validate()
    if args.render:
        files=sorted((ROOT/'templates').glob('*.docx'))+sorted((ROOT/'qa-layouts').glob('*.docx'))
        results=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for item in pool.map(render,files):
                results.append(item);print(json.dumps(item),flush=True)
        (ROOT/'qa-renders'/'render-results.json').write_text(json.dumps(results,indent=2)+'\n')
