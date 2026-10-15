"""Read-only snapshots. Content hashes identify versions; never persist inputs."""
from collections import OrderedDict
from threading import RLock

from app.data import load_dataset


class VenueRepository:
    def __init__(self, path=None, cache_size=4):
        self.path = path
        self.cache_size = max(1, cache_size)
        self._cache = OrderedDict()
        self._lock = RLock()

    def snapshot(self):
        # The loader reads a single byte snapshot, avoiding hash/read races.
        loaded = load_dataset(self.path)
        key = (loaded.dataset_version, loaded.dataset_source)
        with self._lock:
            if key not in self._cache:
                self._cache[key] = loaded
            self._cache.move_to_end(key)
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)
            return self._cache[key]
