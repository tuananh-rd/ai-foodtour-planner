"""Validate a bounded, inert ShopeeFood archive snapshot; errors never contain records."""
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import zipfile

FILES = {
    'shopeefood_dishes.json': ('shopeefood-dishes/1', 'dishes', 20000),
    'shopeefood_menu_items.json': ('shopeefood-menu-items/1', 'items', 30000),
    'shopeefood_menu_options.json': ('shopeefood-menu-options/1', 'options', 200000),
    'shopeefood_mapping.json': ('shopeefood-mapping/1', 'venues', 2000),
}
MAX_ARCHIVE = 64*1024*1024
MAX_MEMBER = 32*1024*1024
MAX_EXPANDED = 128*1024*1024
CRAWL_STATUSES={'ok','error','no_service','not_collected','review','empty_confirmed','not_rendered','blocked'}


class MenuValidationError(ValueError):
    def __init__(self, code):
        self.code=code
        super().__init__(code)


def require(condition, code):
    if not condition: raise MenuValidationError(code)


def identifier(value):
    return ((type(value) is int and value>0) or
            (isinstance(value,str) and 0<len(value)<=200 and value.strip()==value
             and all(ord(c)>=32 for c in value)))


def stamp(value, required=True):
    if value is None and not required: return
    require(isinstance(value,str) and len(value)<=80,'timestamp_type')
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        require(parsed.tzinfo is not None,'timestamp_timezone_missing')
    except ValueError:
        raise MenuValidationError('timestamp_invalid') from None


def unique(rows,key,code):
    values={}
    for row in rows:
        value=row.get(key)
        require(identifier(value),code+'_type')
        require(str(value) not in values,code+'_duplicate')
        values[str(value)]=row
    return values


def no_duplicate_keys(pairs):
    result={}
    for key,value in pairs:
        require(key not in result,'json_duplicate_key')
        result[key]=value
    return result


def reject_nonfinite(_):
    raise MenuValidationError('json_nonfinite')


@dataclass(frozen=True)
class MenuArchive:
    documents: dict
    sha256: str
    counts: dict
    warnings: dict
    raw: bytes = field(repr=False)


def read_menu_archive(path):
    if isinstance(path,MenuArchive): return path
    try:
        with Path(path).open('rb') as stream: raw=stream.read(MAX_ARCHIVE+1)
        require(len(raw)<=MAX_ARCHIVE,'archive_size_cap')
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos=archive.infolist()
            require(len(infos)<=64,'archive_member_cap')
            require(len({i.filename for i in infos})==len(infos),'archive_duplicate_member')
            require(sum(i.file_size for i in infos)<=MAX_EXPANDED,'archive_expanded_cap')
            for info in infos:
                name=info.filename
                require('\\' not in name and ':' not in name and not PurePosixPath(name).is_absolute()
                        and '..' not in PurePosixPath(name).parts,'archive_unsafe_path')
                require((info.external_attr>>16)&0o170000 != 0o120000,'archive_symlink')
                require(not info.flag_bits&1,'archive_encrypted')
                require(info.file_size<=MAX_MEMBER,'archive_member_size_cap')
                require(info.file_size<=max(1,info.compress_size)*250,'archive_compression_ratio')
            require(set(FILES)<=set(archive.namelist()),'archive_required_file_missing')
            documents={}
            for name,(schema,key,limit) in FILES.items():
                with archive.open(name) as stream:blob=stream.read(MAX_MEMBER+1)
                require(len(blob)<=MAX_MEMBER,'archive_member_size_cap')
                doc=json.loads(blob,object_pairs_hook=no_duplicate_keys,parse_constant=reject_nonfinite)
                require(isinstance(doc,dict) and doc.get('schema')==schema,'schema_unsupported')
                require(isinstance(doc.get(key),list) and len(doc[key])<=limit,'row_cap_or_type')
                require(all(isinstance(r,dict) for r in doc[key]),'row_not_object')
                documents[name]=doc
        counts,warnings=validate_documents(documents)
        return MenuArchive(documents,hashlib.sha256(raw).hexdigest(),counts,warnings,raw)
    except MenuValidationError: raise
    except (OSError,ValueError,KeyError,TypeError,RecursionError,RuntimeError,zipfile.BadZipFile,NotImplementedError):
        raise MenuValidationError('archive_unreadable_or_malformed') from None


def validate_documents(docs):
    dishes=docs['shopeefood_dishes.json']['dishes']
    items=docs['shopeefood_menu_items.json']['items']
    options=docs['shopeefood_menu_options.json']['options']
    mappings=docs['shopeefood_mapping.json']['venues']
    links=docs['shopeefood_dishes.json'].get('dish_groups')
    require(isinstance(links,list) and len(links)<=30000 and all(isinstance(r,dict) for r in links),'links_type_or_cap')
    by_venue=unique(mappings,'foody_id','mapping_id')
    by_item=unique(items,'item_id','item_id')
    by_dish=unique(dishes,'dish_id','dish_id')
    unique(options,'option_id','option_id')
    warnings=Counter();statuses=Counter();attempts=Counter();branches={}
    for venue,row in by_venue.items():
        status=row.get('shopee_status')
        require(isinstance(status,str) and status in CRAWL_STATUSES,'crawl_status_unsupported')
        statuses[status]+=1
        last_status=row.get('last_attempt_status',status)
        require(isinstance(last_status,str) and last_status in CRAWL_STATUSES,'attempt_status_unsupported')
        attempts[last_status]+=1
        stamp(row.get('fetched_at'),required=status=='ok')
        if row.get('last_attempt_at') is not None:stamp(row['last_attempt_at'])
        if row.get('match_status')!='confirmed':
            require(status!='ok','successful_mapping_unconfirmed')
            warnings['unconfirmed_venue']+=1;continue
        delivery=row.get('shopee_delivery_id')
        require(identifier(delivery),'mapping_delivery_id')
        require(str(delivery) not in branches,'mapping_branch_conflict')
        branches[str(delivery)]=venue
        lat,lon=row.get('shopee_lat'),row.get('shopee_lon')
        require(all(type(x) in (int,float) and math.isfinite(x) for x in (lat,lon))
                and 20.55<=lat<=21.4 and 105.28<=lon<=106.05,'mapping_coordinates_invalid')
        require(all(isinstance(row.get(k),str) and row[k].strip() for k in ('foody_name','foody_address')),'mapping_text_missing')
    canonical=set()
    for rows in (dishes,items):
        for row in rows:
            require(identifier(row.get('foody_id')),'record_venue_id_type')
            venue=str(row.get('foody_id',''));mapping=by_venue.get(venue)
            require(mapping is not None and mapping.get('match_status')=='confirmed','record_mapping_orphan')
            require(identifier(row.get('source_dish_id')) and identifier(row.get('shopee_delivery_id')),'canonical_key_type')
            require(str(row['shopee_delivery_id'])==str(mapping.get('shopee_delivery_id')),'record_branch_mismatch')
            if rows is dishes:
                key=(str(row['shopee_delivery_id']),str(row['source_dish_id']))
                require(key not in canonical,'canonical_key_duplicate');canonical.add(key)
            name=row.get('name_norm') or row.get('name_raw')
            require((isinstance(name,str) and 0<len(name)<=2000)
                or (rows is dishes and row.get('conflict_status')=='conflict' and name is None),'food_name_type')
            if 'is_dish' in row:require(type(row['is_dish']) is bool,'is_dish_type')
            else:warnings['legacy_nonfood_flag_missing']+=1
            require(row.get('price_channel')=='shopeefood_delivery' and row.get('currency')=='VND','price_channel_or_currency')
            require(type(row.get('is_available')) is bool or row.get('is_available') is None,'availability_type')
            for key in ('budget_price_vnd','min_total_vnd','list_price_vnd','promo_price_vnd','min_required_surcharge_vnd'):
                require(row.get(key) is None or type(row[key]) is int,'price_type')
            require(row.get('price_verification') in ('verified','promo_unverified','unverified','conflict'),'price_verification_unsupported')
            if rows is items:stamp(row.get('fetched_at'))
    for row in dishes:
        require(type(row.get('has_mandatory_options')) is bool or
                row.get('conflict_status')=='conflict' and row.get('has_mandatory_options') is None,'mandatory_type')
        require(row.get('conflict_status') in ('none','conflict'),'conflict_status_type')
        if row.get('conflict_status')=='conflict':
            require(isinstance(row.get('variants'),list) and row['variants'],'conflict_variants_missing')
            warnings['conflicted_dish']+=1
    linked_items=set();linked_dishes=set();link_keys=set();observations={}
    for link in links:
        require(all(identifier(link.get(k)) for k in
            ('dish_id','item_id','foody_id','shopee_delivery_id','source_dish_id')),'link_reference_type')
        dish=by_dish.get(str(link.get('dish_id')));item=by_item.get(str(link.get('item_id')))
        require(dish is not None and item is not None,'dish_group_orphan')
        require(type(link.get('group_id')) is int or identifier(link.get('group_id')),'group_id_type')
        key=(str(link['dish_id']),str(link['item_id']))
        require(key not in link_keys,'dish_group_duplicate');link_keys.add(key)
        for field in ('foody_id','shopee_delivery_id','source_dish_id'):
            require(str(dish.get(field))==str(item.get(field))==str(link.get(field)),'dish_group_branch_mismatch')
        require(str(link['group_id'])==str(item.get('group_id')),'dish_group_id_mismatch')
        linked_items.add(str(link['item_id']));linked_dishes.add(str(link['dish_id']))
        observations.setdefault(str(link['dish_id']),[]).append(item)
    require(linked_items==set(by_item) and linked_dishes==set(by_dish),'unlinked_canonical_or_item')
    for identity,rows in observations.items():
        if any(len({json.dumps(r.get(field),sort_keys=True) for r in rows})>1 for field in
               ('name_norm','description','list_price_vnd','promo_price_vnd','is_available','properties','option_group_count')):
            require(by_dish[identity].get('conflict_status')=='conflict','unmarked_canonical_conflict')
    for row in options:
        require(identifier(row.get('item_id')) and identifier(row.get('foody_id')),'option_reference_type')
        item=by_item.get(str(row.get('item_id')))
        require(item is not None and str(row.get('foody_id'))==str(item['foody_id']),'option_orphan_or_branch')
        require((type(row.get('option_group_id')) is int or identifier(row.get('option_group_id')))
                and type(row.get('mandatory')) is bool,'option_group_type')
        for key in ('min_select','max_select','option_price_vnd'):
            require(row.get(key) is None or type(row[key]) is int,'option_numeric_type')
    counts={'attempted_venues':len(mappings),'menu_venues':len({str(r['foody_id']) for r in dishes}),
        'canonical_records':len(dishes),'group_links':len(links),'options':len(options),
        'explicit_nonfood_records':sum(r.get('is_dish') is False for r in dishes),
        'unavailable_records':sum(r.get('is_available') is False for r in dishes),
        'crawl_statuses':dict(sorted(statuses.items())), 'last_attempt_statuses':dict(sorted(attempts.items()))}
    return counts,dict(warnings)
