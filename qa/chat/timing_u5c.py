"""Isolate the post-595bde8 absent-person regex with a process-local control."""
from review_u5c import *
understanding=importlib.import_module('app.chat.understand')
method=understanding._understand
source=textwrap.dedent(inspect.getsource(method))
start=source.index('    if guided:  # an allergy of someone')
end=source.index('    raw_safety = text')
scope={}
exec(compile(source[:start]+source[end:],'<without-absent-guard>','exec'),method.__globals__,scope)
eng=new_engine()
rows=[]
for size in [250,500,1000]:
    text=('dị ứng '*1000)[:size]
    for name,func in [('current',method),('without_absent_regex',scope['_understand'])]:
        samples=[]
        for _ in range(3):
            start=time.perf_counter();func(text,ChatState(),eng.gz,Preferences(),True)
            samples.append((time.perf_counter()-start)*1000)
        rows.append(dict(chars=len(text),variant=name,median_ms=round(statistics.median(samples),4),max_ms=round(max(samples),4)))
save('timing_isolation',rows)
print(json.dumps(rows,ensure_ascii=False))
