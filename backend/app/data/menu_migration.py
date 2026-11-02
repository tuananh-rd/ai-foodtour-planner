"""Explicit local-only staging/activation; no service restart, environment edit or network."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
from contextlib import contextmanager
from .menu_archive import read_menu_archive, require, MenuValidationError
from .menu import load_menu_archive


def summary(archive):
    mappings=archive.documents['shopeefood_mapping.json']['venues']
    _,effective,_=load_menu_archive(archive,(str(m['foody_id']) for m in mappings))
    warnings=dict(archive.warnings)
    for key in ('price_quarantined','minimum_unverified'):
        if effective.get(key):warnings[key]=effective[key]
    return {'manifest_schema':'foodtour-menu-stage/1','sha256':archive.sha256,
        'counts':{**archive.counts,'effective':effective},'warnings':warnings,'errors':[]}


def dry_run(path):
    return {'status':'valid_not_activated',**summary(read_menu_archive(path))}


def atomic_write(path,content):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    handle,tmp=tempfile.mkstemp(prefix='.menu-',dir=path.parent)
    try:
        with os.fdopen(handle,'wb') as stream:
            stream.write(content);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def stage(path,store):
    archive=read_menu_archive(path)
    report=summary(archive)
    destination=Path(store)/archive.sha256
    destination.mkdir(parents=True,exist_ok=True)
    target=destination/'archive.zip'
    if target.exists():require(read_menu_archive(target).sha256==archive.sha256,'staged_hash_mismatch')
    else:atomic_write(target,archive.raw)
    report['staged_at']=datetime.now(timezone.utc).isoformat()
    atomic_write(destination/'manifest.json',json.dumps(report,sort_keys=True,indent=2).encode())
    return {'status':'staged_not_activated',**report}


def branches(archive):
    return {str(m['foody_id']):str(m['shopee_delivery_id']) for m in
        archive.documents['shopeefood_mapping.json']['venues'] if m.get('match_status')=='confirmed'}


@contextmanager
def activation_lock(active):
    active=Path(active);active.parent.mkdir(parents=True,exist_ok=True)
    lock=active.with_name(active.name+'.activation.lock')
    try:handle=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    except FileExistsError:raise MenuValidationError('activation_locked') from None
    try:
        os.close(handle)
        yield
    finally:lock.unlink()


def activate(version,store,active,*,confirmed=False,allow_partial=False):
    require(confirmed,'explicit_activation_required')
    require(isinstance(version,str) and re.fullmatch('[0-9a-f]{64}',version) is not None,'version_invalid')
    source=Path(store)/version/'archive.zip'
    archive=read_menu_archive(source)
    require(archive.sha256==version,'staged_hash_mismatch')
    report=summary(archive)
    manifest_path=source.parent/'manifest.json'
    try:
        require(manifest_path.stat().st_size<=100000,'manifest_size_cap')
        manifest=json.loads(manifest_path.read_text())
        require(manifest.get('manifest_schema')=='foodtour-menu-stage/1' and manifest.get('sha256')==version,'manifest_invalid')
    except (OSError,ValueError,AttributeError):raise MenuValidationError('manifest_invalid') from None
    partial=archive.counts['attempted_venues']!=archive.counts['menu_venues']
    require(not partial or allow_partial,'partial_archive_requires_acknowledgement')
    active=Path(active)
    with activation_lock(active):
        previous=None
        if active.exists():
            old=read_menu_archive(active)
            before,after=branches(old),branches(archive)
            require(all(after[k]==v for k,v in before.items() if k in after),'branch_reassignment_forbidden')
            previous=stage(old,store)['sha256']
            require(read_menu_archive(active).sha256==old.sha256,'active_changed_during_activation')
        atomic_write(active,archive.raw)
    return {'status':'activated','sha256':version,'previous_sha256':previous,
            'rollback_available':previous is not None,'counts':report['counts'],'warnings':report['warnings']}
