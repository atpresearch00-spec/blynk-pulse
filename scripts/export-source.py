#!/usr/bin/env python3
"""Export the committed source, preserving executable modes and omitting Site identity."""
import argparse,hashlib,json,pathlib,subprocess,zipfile
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
entries={}
for record in subprocess.check_output(['git','ls-files','--stage','-z'],cwd=root).decode().split('\0'):
    if not record:continue
    attributes,name=record.split('\t',1);mode,_,_=attributes.split()
    if name.endswith('.tsbuildinfo') or name.startswith(('.env','.sites-runtime/','node_modules/','dist/')):continue
    data=subprocess.check_output(['git','show',commit+':'+name],cwd=root)
    if name=='.openai/hosting.json':
        config=json.loads(data);config.pop('project_id',None);data=(json.dumps(config,indent=2)+'\n').encode()
    entries[name]=(data,0o755 if mode=='100755' else 0o644)
metadata={'source_commit':commit,'site_identity_removed':True,'database_contents_included':False,'device_credentials_included':False,'restore_instructions':'Read START-HERE.md and RESTORE-WITH-CHATGPT.md. Create a separate Site; do not overwrite the original.'}
entries['BACKUP-METADATA.json']=((json.dumps(metadata,indent=2)+'\n').encode(),0o644)
checks=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,(data,_) in sorted(entries.items()))
entries['SHA256SUMS.txt']=(checks.encode(),0o644)
out=pathlib.Path(args.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,(data,mode) in sorted(entries.items()):
        info=zipfile.ZipInfo('blynk-pulse-source/'+name);info.create_system=3;info.external_attr=(0o100000|mode)<<16;info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,data)
with zipfile.ZipFile(out) as archive:assert archive.testzip() is None
print(json.dumps({'archive':str(out),'files':len(entries),'commit':commit,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'executable_permissions_preserved':True}))
