from __future__ import annotations
import argparse, shutil, sqlite3
from pathlib import Path

DB_NAMES = ('stock.db','stock_gandhipuram.db','stock_gobalapuram.db')

def sqlite_backup(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(f'file:{src.as_posix()}?mode=ro', uri=True, timeout=30)
    target = sqlite3.connect(dst, timeout=30)
    try:
        source.backup(target)
        target.execute('PRAGMA integrity_check')
        row = target.fetchone() if False else None
        target.commit()
    finally:
        target.close(); source.close()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--target', required=True)
    args=ap.parse_args()
    src=Path(args.source); dst=Path(args.target)
    (dst/'db').mkdir(parents=True, exist_ok=True)
    copied=[]
    for name in DB_NAMES:
        s=src/'db'/name
        d=dst/'db'/name
        if s.exists() and not d.exists():
            sqlite_backup(s,d); copied.append(f'db/{name}')
    for name in ('storage_categories.json',):
        s=src/name; d=dst/name
        if s.exists() and not d.exists():
            shutil.copy2(s,d); copied.append(name)
    for folder in ('uploads','processed','exports','product_images'):
        s=src/folder; d=dst/folder
        if s.exists() and not d.exists():
            shutil.copytree(s,d,dirs_exist_ok=True); copied.append(folder+'/')
    print('[DATA SNAPSHOT] ' + (', '.join(copied) if copied else 'No files copied (V31 data already exists).'))

if __name__=='__main__': main()
