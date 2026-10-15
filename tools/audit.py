"""Audit the explicit input, preserve evidence, never impute facts."""
import csv, hashlib, io, json, sys, unicodedata
from collections import Counter
from pathlib import Path

def audit(path):
    blob = Path(path).read_bytes()
    text = blob.decode('utf-8-sig', errors='strict')
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows or any(None in r or None in r.values() for r in rows):
        raise ValueError('Empty or malformed CSV')
    def counts(key): return dict(Counter(r[key] for r in rows))
    def duplicates(keys):
        c = Counter(tuple(unicodedata.normalize('NFC',r[k]).strip().casefold() for k in keys) for r in rows)
        return [list(k) for k,v in c.items() if v>1]
    coords = [(float(r['lat']),float(r['lon'])) for r in rows]
    invalid = [r['foody_id'] for r,(lat,lon) in zip(rows,coords) if not (-90<=lat<=90 and -180<=lon<=180)]
    venues=[]
    for r in rows:
        v = dict(r)
        v['id']=r['foody_id']
        v['lat'],v['lon']=float(r['lat']),float(r['lon'])
        for key in ('price_min_vnd_norm','price_max_vnd_norm'):
            v[key]=int(r[key]) if r[key] else None
        v['opening_hours_raw']=json.loads(r['opening_hours_raw'])
        venues.append(v)
    report={'input_path':str(Path(path).resolve()),'sha256':hashlib.sha256(blob).hexdigest(),
        'bytes':len(blob),'encoding':'UTF-8 BOM' if blob.startswith(b'\xef\xbb\xbf') else 'UTF-8 (strict decode)',
        'rows':len(rows),'columns':reader.fieldnames,
        'missing':{k:sum(not r[k].strip() for r in rows) for k in reader.fieldnames},
        'duplicates':{','.join(k):duplicates(k) for k in [('foody_id',),('source_url',),('name','address'),('lat','lon')]},
        'distribution':{k:counts(k) for k in ('city','district','venue_types','geo_status','price_status','hours_status','hours_day_codes_raw')},
        'bbox':{'min_lat':min(x[0] for x in coords),'max_lat':max(x[0] for x in coords),'min_lon':min(x[1] for x in coords),'max_lon':max(x[1] for x in coords)},
        'invalid_coordinates':invalid,
        'price_exceptions':[r for r in rows if r['price_status']!='ok'],
        'price_min':min(v['price_min_vnd_norm'] for v in venues if v['price_min_vnd_norm'] is not None),
        'price_max':max(v['price_max_vnd_norm'] for v in venues if v['price_max_vnd_norm'] is not None),
        'fetched_range':[min(r['fetched_at'] for r in rows),max(r['fetched_at'] for r in rows)],
        'tags':{k:dict(Counter(t.strip() for r in rows for t in r[k].split('|') if t.strip())) for k in ('dish_groups','cuisine_styles')},
        'rating_range':[min(float(r['rating_value']) for r in rows),max(float(r['rating_value']) for r in rows)],
        'review_range':[min(int(r['review_count']) for r in rows),max(int(r['review_count']) for r in rows)]}
    return report,venues

if __name__=='__main__':
    report,venues=audit(sys.argv[1])
    root=Path(__file__).resolve().parents[1]
    (root/'docs').mkdir(exist_ok=True)
    (root/'data').mkdir(exist_ok=True)
    (root/'docs/audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'data/venues.json').write_text(json.dumps(venues,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True,indent=2))
