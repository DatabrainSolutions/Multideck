"""Package reviewed template sources and generate a readable catalogue index."""
import csv
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parent

def clean(value):
    text='' if value is None else str(value)
    return text.replace('|','\\|').replace('\n',' ')

def csv_value(value):
    text='' if value is None else str(value)
    text='\n'.join(line.rstrip() for line in text.replace('\r\n','\n').split('\n'))
    return "'"+text if text.startswith(('=','+','-','@')) else text

def main():
    manifest=json.loads((ROOT/'catalogue-crosswalk.json').read_text())
    lines=['# Editable catalogue template index','',
           'All entries below are unpublished drafts in Documents > Manage templates. Source adapters and production issuance are deferred.','',
           '| Draft layout | Proposed source | BoxTop sheet rows |',
           '| --- | --- | --- |']
    for template in manifest['templates']:
        rows=', '.join(map(str,template['catalogueRows'])) or 'Additional sample-derived layout'
        lines.append(f"| [{clean(template['name'])}]({template['file']}) | {clean(template['sourceRecord'])} | {rows} |")
    lines.extend(['','## Matching notes',''])
    for template in manifest['templates']:
        lines.extend(['### '+template['name'],'',template['reviewGate'],'',
                      'Sample references: '+(', '.join('`'+p+'`' for p in template['samples']) or 'Catalogue purpose and common operational field structure only; no direct sample match.'),'',
                      'Fictional preview: [JSON](samples/'+template['code']+'.json).',''])
    (ROOT/'TEMPLATE_INDEX.md').write_text('\n'.join(lines))
    columns=['row','section','menu','name','outputCode','status','templateCode','sourceRecord','gate','evidence','mapping','notes']
    with (ROOT/'catalogue-crosswalk.csv').open('w',newline='',encoding='utf-8-sig') as handle:
        writer=csv.DictWriter(handle,fieldnames=columns,lineterminator='\n')
        writer.writeheader()
        for row in manifest['crosswalk']:
            writer.writerow({key:csv_value(row.get(key,'')) for key in columns})
    package=ROOT/'Multideck-document-catalogue-drafts.zip'
    files=[ROOT/name for name in ('README.md','TEMPLATE_INDEX.md','catalogue-crosswalk.csv','catalogue-crosswalk.json','catalogue-specs.json','library-verification.json')]
    files+=sorted((ROOT/'templates').glob('*.docx'))+sorted((ROOT/'samples').glob('*.json'))
    with ZipFile(package,'w',ZIP_DEFLATED) as archive:
        for path in files: archive.write(path,path.relative_to(ROOT))
    with ZipFile(package) as archive:
        assert archive.testzip() is None
        assert len([n for n in archive.namelist() if n.endswith('.docx')])==35
    print(json.dumps({'package':str(package),'editableTemplates':35,'files':len(files),'catalogueRows':len(manifest['crosswalk'])}))

if __name__=='__main__': main()
