"""Evidence-preserving discovery API. No unverified schedule claims."""
import json, math, os
from pathlib import Path
from typing import Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT=Path(__file__).resolve().parents[2]
app=FastAPI(title='AI FoodTour Planner',version='0.1.0')
app.add_middleware(CORSMiddleware,allow_origins=[os.getenv('WEB_ORIGIN','http://localhost:3000')],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

def load():
    p=ROOT/'data/venues.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else []

class PlanRequest(BaseModel):
    city: str=Field(default='Hà Nội',max_length=100)
    lat: float=Field(ge=-90,le=90)
    lon: float=Field(ge=-180,le=180)
    budget_vnd: int=Field(gt=0,le=100000000)
    duration_min: int=Field(ge=30,le=720)
    interests: list[str]=Field(default_factory=list,max_length=10)
    max_stops: int=Field(default=3,ge=1,le=5)
    mode: Literal['explore','strict']='explore'

def distance(a,b):
    lat1,lon1,lat2,lon2=map(math.radians,[*a,*b])
    h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371*2*math.asin(min(1,math.sqrt(h)))

def plan(req,rows):
    warnings=['Giờ theo ngày chưa xác minh; cần liên hệ quán.',
      'Khoảng giá của quán không bảo đảm chi phí mỗi người.',
      'Khoảng cách đường chim bay; chưa có tuyến đường hay thời gian di chuyển thực.']
    if req.mode=='strict':
        return {'status':'insufficient_evidence','stops':[], 'warnings':warnings,
          'reason':'Chưa có giờ theo ngày, giá khẩu phần và ma trận định tuyến đã xác minh.'}
    pool=[r for r in rows if r['city']==req.city and 'Shop Online' not in r['venue_types']
          and r['geo_status']=='ok' and r['price_status']=='ok'
          and r['price_max_vnd_norm'] is not None]
    if req.interests:
        pool=[r for r in pool if any(x.strip().casefold() in (r['dish_groups']+' | '+r['cuisine_styles']).casefold() for x in req.interests if x.strip())]
    point=(req.lat,req.lon); total=0; km=0; stops=[]
    # Thirty minutes per stop is an explicit exploration setting, not source data.
    limit=min(req.max_stops,req.duration_min//30)
    while pool and len(stops)<limit:
        feasible=[r for r in pool if total+r['price_max_vnd_norm']<=req.budget_vnd]
        if not feasible: break
        chosen=min(feasible,key=lambda r:(distance(point,(r['lat'],r['lon'])),r['id']))
        leg=distance(point,(chosen['lat'],chosen['lon'])); km+=leg
        total+=chosen['price_max_vnd_norm']; stops.append({**chosen,'straight_line_leg_km':round(leg,3)})
        point=(chosen['lat'],chosen['lon']); pool.remove(chosen)
    return {'status':'conditional_suggestions' if stops else 'no_candidates','stops':stops,
        'venue_range_upper_sum_vnd':total,'straight_line_total_km':round(km,3),
        'schedule_verified':False,'budget_guaranteed':False,'warnings':warnings,
        'assumptions':{'visit_minutes_per_stop':30,'travel_minutes':None},
        'requested_duration_min':req.duration_min}

@app.get('/health')
def health(): return {'status':'ok','dataset_loaded':bool(load())}

@app.get('/v1/venues')
def venues(city: str='Hà Nội'): return {'items':[r for r in load() if r['city']==city]}

@app.post('/v1/plans')
def create_plan(req: PlanRequest): return plan(req,load())
