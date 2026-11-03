"""Bounded local menu evidence. Delivery references never become planner/dine-in prices."""
import os
import re
from collections import Counter, defaultdict
from app.planner.relevance import fold_uncached
from app.planner.types import Venue
import math
from .menu_archive import read_menu_archive


def contact_row(name):
    folded=fold_uncached(name)
    digits=re.sub(r'[\s.()+-]','',name)
    return bool(re.fullmatch(r'\d{8,15}',digits) or (len(name)<=60 and
        re.search(r'\b(?:hotline|hot line|phone|telephone|sdt|so dien thoai)\b',folded)))


def amount(value, zero=False):
    return value if type(value) is int and (0 if zero else 1) <= value <= 10000000 else None


def load_menu_archive(path, venue_ids, *, include_ids=False):
    counts=Counter()
    archive=read_menu_archive(path)
    wanted=('shopeefood_dishes.json','shopeefood_menu_items.json',
            'shopeefood_menu_options.json','shopeefood_mapping.json')
    dishes_doc=archive.documents[wanted[0]]
    dishes=dishes_doc['dishes']; links=dishes_doc['dish_groups']
    items=archive.documents[wanted[1]]['items']
    options=archive.documents[wanted[2]]['options']
    mappings=archive.documents[wanted[3]]['venues']
    counts.update(canonical_dishes=len(dishes),group_links=len(links),options=len(options),mapped_venues=len(mappings))
    confirmed={str(m['foody_id']) for m in mappings if m.get('match_status')=='confirmed'} & set(venue_ids)
    item_by_id={i['item_id']:i for i in items}
    item_links=defaultdict(list)
    for link in links:
        item_links[link['dish_id']].append(link['item_id'])
    option_groups=defaultdict(lambda:defaultdict(list))
    for option in options:
        option_groups[option['item_id']][str(option['option_group_id'])].append(option)
    result=defaultdict(list)
    for identity in confirmed:result[identity]=[]
    seen=set()
    for dish in dishes:
        venue=str(dish.get('foody_id','')); identity=dish.get('dish_id')
        if venue not in confirmed or identity in seen:
            counts['unmatched_or_duplicate']+=1;continue
        seen.add(identity)
        name=dish.get('name_norm') or dish.get('name_raw') or ''
        if dish.get('is_dish') is False or dish.get('dish_kind')=='non_dish' or not isinstance(name,str) or not name.strip() or contact_row(name):
            counts['contact_or_invalid_excluded']+=1;continue
        linked=[item_by_id[i] for i in item_links[identity] if i in item_by_id]
        if not linked or any(str(i.get('foody_id'))!=venue for i in linked):
            counts['invalid_link']+=1;continue
        base=amount(dish.get('budget_price_vnd'))
        quarantined=(dish.get('price_verification') not in ('verified','promo_unverified')
            or dish.get('conflict_status')!='none' or any(i.get('price_flag') for i in linked)
            or base is None or base<=1000 or base>2000000)
        mandatory=dish.get('has_mandatory_options') is True
        minima=[]
        for item in linked:
            total=0;known=True;required_group_seen=False
            for group in option_groups[item['item_id']].values():
                if not any(o.get('mandatory') is True for o in group):continue
                required_group_seen=True
                selections={o.get('min_select') for o in group}
                prices=[amount(o.get('option_price_vnd'),zero=True) for o in group]
                if (len(selections)!=1 or type(next(iter(selections))) is not int
                    or next(iter(selections))<1 or any(p is None for p in prices)):
                    known=False;break
                minimum=next(iter(selections))
                maxima=[o.get('max_select') for o in group if o.get('max_select') is not None]
                if len(prices)<minimum or any(v<minimum for v in maxima):known=False;break
                total+=sum(sorted(prices)[:minimum])
            if mandatory and not required_group_seen:known=False
            minima.append(total if known else None)
        surcharge=(minima[0] if minima and all(x==minima[0] and x is not None for x in minima) else None)
        if mandatory and dish.get('min_required_surcharge_status')!='computed':surcharge=None
        if not mandatory:surcharge=0
        minimum=base+surcharge if base is not None and surcharge is not None and not quarantined else None
        if minimum != dish.get('min_total_vnd'):
            minimum=None;counts['minimum_unverified']+=1
        if quarantined:counts['price_quarantined']+=1
        result[venue].append({**({'id':dish['dish_id']} if include_ids else {}),'name':name.strip()[:160],
            'reference_price_vnd':None if quarantined else base,'min_total_vnd':minimum,
            'price_status':'quarantined' if quarantined else 'reference' if minimum is not None else 'minimum_unknown',
            'mandatory_options':mandatory,'price_channel':'shopeefood_delivery',
            'availability':'unavailable' if dish.get('is_available') is False else 'source_available' if dish.get('is_available') is True else 'unknown',
            'source_fetched_at':next((i.get('fetched_at') for i in linked if i.get('fetched_at')),None)})
    counts['linked_venues']=len(result)
    counts['food_rows']=sum(map(len,result.values()))
    version=archive.sha256
    return dict(result),dict(counts),version


def configured_menu(venue_ids):
    path=os.getenv('FOODTOUR_MENU_PATH','').strip()
    return load_menu_archive(path,venue_ids) if path else ({},{},'')


def mapped_venues(path,existing_ids):
    """Add only explicitly confirmed source mappings missing from the older catalog."""
    mappings=read_menu_archive(path).documents['shopeefood_mapping.json']['venues']
    result=[]
    for m in mappings:
        identity=str(m.get('foody_id',''))
        if identity in existing_ids or m.get('match_status')!='confirmed':continue
        lat,lon=m.get('shopee_lat'),m.get('shopee_lon')
        if not all(type(v) in (int,float) and math.isfinite(v) for v in (lat,lon)):continue
        if not (20.55<=lat<=21.4 and 105.28<=lon<=106.05):continue
        name=m.get('foody_name') or m.get('shopee_name')
        address=m.get('foody_address') or m.get('shopee_address')
        if not name or not address:continue
        result.append(Venue(identity,name,lat,lon,address=address,district=m.get('foody_district') or '',
            source_url=m.get('shopee_url') or '',source_fetched_at=m.get('fetched_at')))
        existing_ids.add(identity)
    return tuple(result)


def matching_menu(rows,foods):
    from app.discovery.food import matches_food
    from types import SimpleNamespace
    return [r for r in rows if r['availability']!='unavailable' and (not foods or any(
        matches_food(SimpleNamespace(dish_tags=(r['name'],)),food) for food in foods))]
