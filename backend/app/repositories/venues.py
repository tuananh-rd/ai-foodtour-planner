"""Read-only snapshots. Content hashes identify versions; never persist inputs."""
from collections import OrderedDict
from threading import RLock
import hashlib
import os
from pathlib import Path

from app.data import load_dataset
from app.data.loader import DEFAULT_PATH, SYNTHETIC_PATH


class VenueRepository:
    def __init__(self, path=None, cache_size=4):
        self.path = path
        self.cache_size = max(1, cache_size)
        self._cache = OrderedDict()
        self._lock = RLock()

    def snapshot(self):
        with self._lock:
            key=self._fingerprint()
            if key not in self._cache:
                # Validate only changed content; repeated reads must not parse a large
                # ZIP while a session mutation holds a database write lock.
                loaded=load_dataset(self.path)
                if self._fingerprint()!=key:
                    return loaded  # a consistent loader snapshot, never cache a racing input
                self._cache[key]=loaded
            self._cache.move_to_end(key)
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)
            return self._cache[key]

    def _fingerprint(self):
        configured=self.path if self.path is not None else (os.getenv('FOODTOUR_DATA_PATH','').strip() or DEFAULT_PATH)
        paths=[str(configured),str(SYNTHETIC_PATH),os.getenv('FOODTOUR_EVIDENCE_PATH','').strip(),
               os.getenv('FOODTOUR_MENU_PATH','').strip()]
        result=[]
        for index,value in enumerate(paths):
            if not value:
                result.append(('',None));continue
            try:
                if index==3:
                    from app.data.menu_archive import MAX_ARCHIVE
                    if Path(value).stat().st_size>MAX_ARCHIVE:
                        result.append((value,'oversized_menu'));continue
                with Path(value).open('rb') as stream:
                    digest=hashlib.file_digest(stream,'sha256').hexdigest()
                result.append((value,digest))
            except OSError as error:
                result.append((value,type(error).__name__))
        return tuple(result)
