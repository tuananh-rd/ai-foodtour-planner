"""Validate/dry-run by default. Staging and activation are separate explicit operations."""
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.data.menu_archive import MenuValidationError
from app.data.menu_migration import dry_run,stage,activate


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path,nargs='?')
    actions=parser.add_mutually_exclusive_group()
    actions.add_argument('--dry-run',action='store_true')
    actions.add_argument('--stage',action='store_true')
    actions.add_argument('--activate',metavar='SHA256')
    actions.add_argument('--rollback',metavar='SHA256')
    parser.add_argument('--confirm-activation',action='store_true')
    parser.add_argument('--allow-partial',action='store_true')
    parser.add_argument('--store',type=Path,default=ROOT/'.venv/private-menu/versions')
    parser.add_argument('--active-path',type=Path,default=ROOT/'.venv/private-menu/shopeefood_menu.zip')
    args=parser.parse_args()
    if args.activate or args.rollback:
        if args.archive:parser.error('Activation takes a staged hash, not an input archive.')
    elif args.archive is None:parser.error('An input archive is required for validation/staging.')
    try:
        if args.activate or args.rollback:
            report=activate(args.activate or args.rollback,args.store,args.active_path,
                confirmed=args.confirm_activation,allow_partial=args.allow_partial)
            if args.rollback:report['status']='rolled_back'
        elif args.stage:report=stage(args.archive,args.store)
        else:report=dry_run(args.archive)
        print(json.dumps(report,sort_keys=True,ensure_ascii=True))
        return 0
    except MenuValidationError as error:
        print(json.dumps({'status':'rejected_no_activation','errors':[error.code],'warnings':{}}))
        return 2
    except OSError:
        print(json.dumps({'status':'io_failure_no_success_claim','errors':['local_io_failure']}))
        return 2

if __name__=='__main__':raise SystemExit(main())
