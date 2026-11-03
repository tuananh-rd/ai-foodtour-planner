"""Click-triggered Photon/OSM reverse lookup; no model/search or persistent GPS log."""
import json
import math
import os
import threading
import time
from collections import OrderedDict
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from app.presentation import plain_text
from app.planner.interfaces import haversine_km


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class ReverseAddress:
    def __init__(self, *, enabled=True, transport=None, search_transport=None, clock=time.monotonic):
        self.enabled = enabled
        self.transport = transport or self._fetch
        self.search_transport = search_transport or self._search_fetch
        self.clock = clock
        self.cache = OrderedDict()
        self.lock = threading.Lock()
        self.last_request = float('-inf')

    @classmethod
    def from_env(cls):
        return cls(enabled=os.getenv('FOODTOUR_REVERSE_GEOCODER', 'photon').lower() == 'photon')

    @staticmethod
    def _fetch(lat, lon):
        url = 'https://photon.komoot.io/reverse?' + urlencode({'lat': lat, 'lon': lon, 'limit': 1})
        req = Request(url, headers={'User-Agent': 'MamMam-FoodTour-LocalPrototype/1.0',
                                  'Accept': 'application/json'})
        with build_opener(NoRedirect).open(req, timeout=2.0) as response:
            raw = response.read(32769)
        if len(raw) > 32768:
            raise ValueError('oversized response')
        return json.loads(raw)

    def resolve(self, lat, lon):
        unavailable = {'address_status': 'unavailable', 'address_provider': None,
                       'address_reason': 'unavailable', 'approximate': True,
                       'label': 'Vị trí GPS chưa có địa chỉ', 'attribution': None}
        if not self.enabled:
            return {**unavailable, 'address_reason': 'disabled'}
        if (any(type(x) not in (float, int) or not math.isfinite(x) for x in (lat, lon))
                or not (20.5 <= lat <= 21.5 and 105.3 <= lon <= 106.3)):
            return {**unavailable, 'address_reason': 'invalid_coordinates'}
        # At most128 entries,10 minutes, rounded cells (~11m); memory only.
        key = (round(lat, 4), round(lon, 4))
        if not self.lock.acquire(blocking=False):
            return {**unavailable, 'address_reason': 'rate_limited'}
        try:
            now = self.clock()
            cached = self.cache.get(key)
            if cached and now - cached[0] < (600 if cached[1]['address_status'] == 'resolved' else 30):
                self.cache.move_to_end(key)
                return dict(cached[1])
            if now - self.last_request < 1.1:
                return {**unavailable, 'address_reason': 'rate_limited'}
            self.last_request = now
            try:
                data = self.transport(*key)
                features = data.get('features') if isinstance(data, dict) else None
                item = features[0] if isinstance(features, list) and features else {}
                props = item.get('properties', {})
                coords = item.get('geometry', {}).get('coordinates', [])
                if (len(coords) != 2 or any(type(x) not in (float, int) or not math.isfinite(x) for x in coords)
                        or not (-180 <= coords[0] <= 180 and -90 <= coords[1] <= 90)
                        or haversine_km((lat, lon), (coords[1], coords[0])) > .5):
                    raise ValueError('no nearby address')
                def value(name):
                    raw = props.get(name)
                    return plain_text(raw).strip()[:100] if isinstance(raw, str) else ''
                street = value('street')
                # A returned name may be a POI; never infer a house number from it.
                # Rounded GPS is near a building, never evidence of its house number.
                road = street or value('name')
                parts = list(dict.fromkeys(x for x in (road, value('district'), value('city'), value('state')) if x))
                if not road:
                    raise ValueError('no address')
                result = {'label': ', '.join(parts)[:240], 'address_status': 'resolved',
                          'address_provider': 'photon', 'address_reason': None,
                          'approximate': True, 'attribution': '© OpenStreetMap contributors'}
            except Exception:
                result = dict(unavailable)
            self.cache[key] = (now, dict(result))
            self.cache.move_to_end(key)
            while len(self.cache) > 128:
                self.cache.popitem(last=False)
            return result
        finally:
            self.lock.release()

    @staticmethod
    def _search_fetch(query):
        url='https://photon.komoot.io/api/?'+urlencode({'q':query,'limit':5,
            'bbox':'105.3,20.5,106.3,21.5'})
        req=Request(url,headers={'User-Agent':'MamMam-FoodTour-LocalPrototype/1.0','Accept':'application/json'})
        with build_opener(NoRedirect).open(req,timeout=2.0) as response:raw=response.read(65537)
        if len(raw)>65536:raise ValueError('oversized response')
        return json.loads(raw)

    def search(self,query):
        """Explicit address submit only; same shared1.1second gate/cache as reverse."""
        import copy
        missing={'status':'unavailable','candidates':[],'provider':'photon'}
        if not self.enabled or not isinstance(query,str) or not 2<=len(query)<=160:return missing
        if not self.lock.acquire(blocking=False):return {**missing,'reason':'rate_limited'}
        try:
            now=self.clock();key=('query',query.casefold().strip());cached=self.cache.get(key)
            if cached and now-cached[0]<600:return copy.deepcopy(cached[1])
            if now-self.last_request<1.1:return {**missing,'reason':'rate_limited'}
            self.last_request=now
            try:
                raw=self.search_transport(query);features=raw.get('features')
                if not isinstance(features,list):raise ValueError('bad features')
                choices=[]
                for feature in features[:5]:
                    coords=feature.get('geometry',{}).get('coordinates',[])
                    if len(coords)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) for v in coords):continue
                    lon,lat=coords
                    if not (20.5<=lat<=21.5 and 105.3<=lon<=106.3):continue
                    props=feature.get('properties',{})
                    val=lambda k:plain_text(props[k])[:100] if isinstance(props.get(k),str) else ''
                    road=' '.join(x for x in (val('housenumber'),val('street')) if x)
                    parts=list(dict.fromkeys(x for x in (val('name'),road,val('district'),val('city')) if x))
                    if not parts:continue
                    choices.append({'lat':float(lat),'lon':float(lon),'label':', '.join(parts)[:240],
                        'source':'photon','kind':val('type') or 'address','approximate':not bool(val('housenumber'))})
                result={'status':'ok' if choices else 'not_found','candidates':choices,'provider':'photon'}
            except Exception:return missing
            self.cache[key]=(now,copy.deepcopy(result));self.cache.move_to_end(key)
            while len(self.cache)>128:self.cache.popitem(last=False)
            return result
        finally:self.lock.release()
