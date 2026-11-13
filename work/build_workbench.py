from pathlib import Path
import json
p=Path(__file__).resolve().parent/'workbench'
order=['config','translations','i18n','model','search','hover','routing','resources','setup','setup-ui']
parts=["'use strict';\nconst __modules = Object.create(null);\n"]
for name in order:
    if name=='translations': parts.append('__modules.translations='+json.dumps(json.loads((p/'translations.json').read_text(encoding='utf-8')),ensure_ascii=False)+';\n');continue
    code=(p/(name+'.js')).read_text(encoding='utf-8')
    for dep in order:code=code.replace("require('./"+dep+(".json" if dep=='translations' else '')+"')",'__modules.'+dep.replace('-','_'))
    code=code.replace('module.exports =','return').replace('module.exports=','return ')
    parts.append('__modules.'+name.replace('-','_')+' = (() => {\n'+code+'\n})();\n')
main=(p/'main.js').read_text(encoding='utf-8')
for name in order:main=main.replace("require('./"+name+"')",'__modules.'+name.replace('-','_'))
parts.append(main)
dest=p/'dist';dest.mkdir(exist_ok=True)
(dest/'main.js').write_text(''.join(parts),encoding='utf-8',newline='\n')
print('Bundled workbench runtime')
