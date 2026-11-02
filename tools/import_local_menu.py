"""Validate an approved archive and retain it locally, never export private records."""
import argparse
import json
from pathlib import Path
import shutil
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from run_online_assistant import local_configuration
from app.data.loader import load_dataset
from app.data.menu import load_menu_archive,mapped_venues

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path)
    args=parser.parse_args()
    local_configuration()
    data=load_dataset()
    additions=mapped_venues(args.archive,{v.id for v in data.venues})
    _,counts,_=load_menu_archive(args.archive,(v.id for v in data.venues+additions))
    if counts['linked_venues']!=12:
        raise SystemExit('Menu mapping incomplete; no archive installed.')
    target=ROOT/'.venv/private-menu/shopeefood_menu.zip'
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(args.archive,target)
    print(json.dumps({'status':'installed_local_only','counts':counts}))

if __name__=='__main__':main()
