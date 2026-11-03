"""One visible venue's paginated canonical menu; never a model/dataset export."""
from collections import Counter, defaultdict
from types import SimpleNamespace
from app.presentation import plain_text
from .menu_archive import read_menu_archive
from .menu import load_menu_archive, amount


def text(value,limit=1200):
    return plain_text(value)[:limit] if isinstance(value,str) else None


def catalog(path,venue_id,*,offset=0,limit=25,q='',group=None,dish_id=None,
            option_offset=0,option_limit=100):
    from app.discovery.food import matches_food
    archive=read_menu_archive(path)
    rows,_,_=load_menu_archive(archive,{venue_id},include_ids=True)
    evidence={str(r['id']):r for r in rows.get(venue_id,[])}
    docs=archive.documents
    items={str(r['item_id']):r for r in docs['shopeefood_menu_items.json']['items']}
    links=defaultdict(list);options=defaultdict(list)
    for row in docs['shopeefood_dishes.json']['dish_groups']:
        if str(row['foody_id'])==venue_id:links[str(row['dish_id'])].append(row)
    for row in docs['shopeefood_menu_options.json']['options']:
        if str(row['foody_id'])==venue_id:options[str(row['item_id'])].append(row)
    groups={};counts=Counter();dishes=[]
    for dish in docs['shopeefood_dishes.json']['dishes']:
        key=str(dish['dish_id'])
        if key not in evidence:continue
        refs=links[key];dish_groups={}
        for link in refs:
            gid=str(link['group_id']);item=items[str(link['item_id'])]
            name=text(item.get('group_raw'),200) or 'Khác'
            dish_groups[gid]={'id':gid,'name':name};groups[gid]=name
        counts.update(dish_groups.keys())
        dishes.append((dish,list(dish_groups.values())))
    total_menu=len(dishes)
    filtered=[(d,g) for d,g in dishes if (not dish_id or str(d['dish_id'])==dish_id)
        and (not group or any(x['id']==group for x in g))
        and (not q or matches_food(SimpleNamespace(dish_tags=(evidence[str(d['dish_id'])]['name'],)),q))]
    public=[]
    for dish,dish_groups in filtered[offset:offset+limit]:
        key=str(dish['dish_id']);row=evidence[key];all_options=[]
        for link in links[key]:all_options.extend(options[str(link['item_id'])])
        unique={str(o['option_id']):o for o in all_options}
        option_groups={}
        for o in list(unique.values())[option_offset:option_offset+option_limit]:
            # Group IDs are branch/item scoped; do not merge conflicting source variants.
            gid=str(o['item_id'])+':'+str(o['option_group_id'])
            group_row=option_groups.setdefault(gid,{'id':gid,'name':text(o.get('option_group'),200),
                'mandatory':o['mandatory'],'min_select':o.get('min_select'),
                'max_select':o.get('max_select'),'options':[]})
            for field in ('mandatory','min_select','max_select'):
                if group_row[field]!=o.get(field):group_row[field]=None
            for field in ('min_select','max_select'):
                value=group_row[field]
                if value is not None and (type(value) is not int or not 0<=value<=1000):group_row[field]=None
            group_row['options'].append({'id':str(o['option_id']),'name':text(o.get('option_name'),300),
                'price_vnd':amount(o.get('option_price_vnd'),zero=True),
                'price_kind':text(o.get('price_kind'),80),
                'is_default':o.get('is_default') if type(o.get('is_default')) is bool else None})
        returned=sum(len(g['options']) for g in option_groups.values())
        public.append({'id':key,'name':text(row['name'],160),'description':text(dish.get('description')),
            'groups':dish_groups,'price_vnd':row['reference_price_vnd'],
            'min_total_vnd':row['min_total_vnd'],'price_status':row['price_status'],
            'availability':row['availability'],'required_options':row['mandatory_options'],
            'option_groups':list(option_groups.values()),'options_total':len(unique),
            'options_returned':returned,'options_complete':option_offset+returned>=len(unique),
            'source_fetched_at':row['source_fetched_at']})
    return {'status':'unavailable' if venue_id not in rows else 'empty' if not total_menu else 'ok',
        'venue_id':venue_id,'menu_version':archive.sha256,'source_channel':'shopeefood_delivery',
        'total_menu':total_menu,'total':len(filtered),'offset':offset,'limit':limit,
        'has_more':offset+len(public)<len(filtered),'groups':[{'id':k,'name':v,'count':counts[k]}
        for k,v in groups.items()],'items':public}
