"""Review coordinator's late 6632640 free-text and visit-minute changes."""
from adversarial_guided import *
from review_u5d import save
eng=new_engine();rows=[]
for cmd in ['lên đường','duyệt luôn','go ahead','tiến hành','được nha']:
    st,pr=ready(eng),Preferences();trace=[]
    for entry in [{'text':'Tôi dị ứng một thứ chưa rõ.'},{'text':cmd},{'action':{'type':'request_plan'}},{'action':{'type':'confirm_yes'}}]:
        r=eng.handle(st,pr,**entry);st,pr=r.state,r.prefs
        trace.append(dict(input=entry,allergies=[a.term for a in st.allergies],pending=getattr(st.pending,'slot',None),unresolved=st.allergy_unresolved,plan=r.plan_request))
    rows.append(trace)
visits=[];st,pr=ready(eng),Preferences()
for text in ['Tour 3 điểm 120 phút','Đổi thành 240 phút']:
    r=eng.handle(st,pr,text=text);st,pr=r.state,r.prefs
    visits.append(dict(text=text,prefs_visit=pr.visit_minutes,duration=st.profile['duration_min'].value,summary_visit=eng._visit_minutes(st)))
save('late',dict(answer_filter=rows,visit_update=visits))
print(json.dumps(dict(answer_filter=rows,visit_update=visits),ensure_ascii=False))
