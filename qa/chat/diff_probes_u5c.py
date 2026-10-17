"""Small diagnostics derived from the post-freeze diff, not blind scores."""
import json
from review_u5c import *

eng=new_engine()
rows=[]
for text in [
    'Tôi dị ứng tôm nhưng bạn tôi không đi cùng',
    'Mình dị ứng sữa nhưng anh ấy không tham gia',
    'Giả sử bạn dị ứng trứng còn tôi dị ứng lạc thật',
    'Mình dị ứng lạc nhưng tôm thì không dị ứng',
    'Tôi kiêng mè và sữa',
]:
    st,pr=ready(eng),Preferences()
    trace=[]
    for entry in [{'text':text},{'action':{'type':'request_plan'}},{'action':{'type':'confirm_yes'}}]:
        r=eng.handle(st,pr,**entry)
        trace.append(dict(input=entry,intent=r.intent,allergies=[a.term for a in r.state.allergies],
                          unresolved=r.state.allergy_unresolved,pending=getattr(r.state.pending,'slot',None),
                          plan_request=r.plan_request,blocks=r.blocks))
        st,pr=r.state,r.prefs
    rows.append(dict(text=text,trace=trace))
save('diff_probes', rows)
for r in rows:
    print(json.dumps(dict(text=r['text'],first_allergies=r['trace'][0]['allergies'],
                         first_unresolved=r['trace'][0]['unresolved'],plan=r['trace'][-1]['plan_request']),ensure_ascii=False))
