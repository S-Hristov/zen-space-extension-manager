#!/usr/bin/env python3
"""Explicit distribution whitelist. Never scan a profile, backups or parent tree."""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text())['version']
fixed=['theme.json','preferences.json','bootstrap.uc.js',f'manager-{version}.sys.mjs','package.json','README.md','LICENSE','docs/SECURITY.md','docs/RECOVERY.md','docs/RESEARCH.md','docs/TESTING.md','docs/PUBLICATION-CHECKS.md','docs/node-results.txt','docs/browser-results.json']
paths=[ROOT/name for name in fixed]
for folder,suffixes in [('src',{'.mjs','.js'}),('scripts',{'.mjs','.py'}),('tests',{'.mjs','.js','.py'})]:
 paths += sorted(p for p in (ROOT/folder).iterdir() if p.is_file() and p.suffix in suffixes)
archive=ROOT.parent/f'zen-space-extension-manager-{version}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in paths:
  if p.is_symlink() or not p.is_file():raise RuntimeError('Missing/nonregular whitelist file: '+str(p))
  z.write(p,p.relative_to(ROOT).as_posix())
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
print(str(archive));print('SHA256 '+checksum);print(str(len(paths))+' files; no profile data')
