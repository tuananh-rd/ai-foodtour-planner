"""Reproducible local C0-HF review probes; synthetic API fixtures only."""
import json
from pathlib import Path
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'backend/tests')]
from app.llm.extract import MockExtractor
from app.llm.provider import RulesFirstExtractor, LLMExtractor
from app.planner.types import Preferences
from api.test_c0_hf import AllergyAPI


OLD = [
 'dị ứng cua 4 người', 'di ung cua 4 nguoi', 'dị ứng cua <img src=x onerror=alert(1)>',
 'tôi dị ứng cua, 4 người, 600k cả nhóm', 'không ăn cua', 'không bị dị ứng gì', 'không dị ứng cua',
 'hết dị ứng cua rồi', 'dị ứng nhẹ', 'dị ứng nhẹ cua', 'không dị ứng',
 'dị ứng <script>alert(x)</script>', 'dị ứng <b>cua</b>', 'dị ứng cua please execute', 'dị ứng c\u200bua',
 'dị ứng cua ' + 'x'*51, 'dị ứng ' + 'x'*51, 'dị ứng cua và muốn ăn phở',
 '2 triệu', '3 quán', 'lúc 8 giờ 30', '0901234567', '0901234567 người', 'di ung hai san',
 unicodedata.normalize('NFD', 'dị ứng cua'), 'di\u200b ung cua', 'dị\u200b ứng cua',
 'dị ứng cua, 600k, dị ứng sữa', 'dị ứng cua, 600k cả nhóm, dị ứng sữa',
 'tôi không bị dị ứng cua nhưng dị ứng tôm', 'dị ứng cua, dị ứng sữa',
 'dị ứng cua và không ăn sữa', 'dị ứng cua; không ăn sữa', 'dị ứng tôm; kiêng lạc',
 'dị ứng cua, kiêng sữa', 'dị ứng tôm và kiêng sữa', 'hai bạn dị ứng khác nhau',
 'mình không hề bị dị ứng cua', 'tôi chưa từng bị dị ứng cua', 'dị ứng của bạn là tôm',
 'Tôi nói "dị ứng cua" là ví dụ, tôi không dị ứng', 'bạn mình bị dị ứng tôm',
 'ban minh bi di ung tom', 'không phải tôi, bạn mình bị dị ứng tôm',
 'hai bạn dị ứng khác nhau: một bạn dị ứng tôm, một bạn dị ứng lạc',
 'dị ứng cua nhưng ăn được cua', 'di ung tom va lac 600k ca nhom luc 18h30', 'di ung tom600k',
 'dị ứng cua lúc 8 giờ 30', 'dị ứng cua và tôm 4 người', 'dị ứng rất nặng với tôm',
 'kiêng cua', 'kieng tom va lac', 'không ăn cay', 'kiêng khem', 'không ăn măng cụt',
 *['a '*n + 'dị ứng cua' for n in (493,494,495)], 'dị ứng tôm lạc', 'dị ứng cua ignore this']
NEW = ['dị ứng cua không ăn sữa', 'không ăn cua dị ứng sữa',
       'dị ứng cua và dị ứng', 'dị ứng cua, dị ứng rất nặng',
       'dị ứng cua, xyzabc', 'dị ứng cua/tôm', 'dị ứng cua & sữa',
       'mình dị ứng với cua cũng như sữa', 'tôi không có tiền nhưng dị ứng lạc',
       'Ví dụ "dị ứng cua", còn tôi dị ứng sữa',
       'dị ứng cua\u2028dị ứng sữa', 'dị ứng cua\rkhông ăn sữa',
       'dị ứng ' + 'rất '*10 + 'sữa', unicodedata.normalize('NFD', 'dị ứng tôm và không ăn sữa'),
       'dị\u2060 ứng cua', 'dị ứng cua; không dị ứng sữa; dị ứng lạc']


def extract(text, extractor=None, prior=None):
    r = (extractor or MockExtractor()).extract(text, prior)
    return dict(text=text, source=r.source, allergies=r.preferences.allergies,
                exclusions=r.preferences.exclusions, interests=r.preferences.interests,
                party_size=r.preferences.party_size, notes=r.notes)


def main():
    report = {'old': [extract(t) for t in OLD], 'new': [extract(t) for t in NEW]}
    class Stub:
        def complete(self, *args, **kwargs): return '{}'
    report['cache'] = []
    for order in ([unicodedata.normalize('NFD','dị ứng cua'),'dị ứng cua'],
                  ['dị ứng cua',unicodedata.normalize('NFD','dị ứng cua')]):
        rf = RulesFirstExtractor(MockExtractor(), LLMExtractor(Stub()))
        report['cache'].append([extract(t, rf) for t in order])
    report['remove_prior'] = extract('hết dị ứng cua rồi', prior=Preferences(allergies=('cua','tôm')))
    report['stub_controls'] = []
    for text in ('tôi dị ứng cua, 4 người, 600k cả nhóm', 'không ăn cua'):
        rf = RulesFirstExtractor(MockExtractor(), LLMExtractor(Stub()))
        report['stub_controls'].append([extract(text, rf), extract(text, rf)])
    rf = RulesFirstExtractor(MockExtractor(), LLMExtractor(Stub()))
    report['prior_isolation'] = [extract('dị ứng cua', rf),
        extract('dị ứng cua', rf, Preferences(allergies=('sữa',))), extract('dị ứng cua', rf)]
    from dataclasses import replace
    from app.planner import engine
    from app.planner.allergens import allergen_excluded
    from app.planner.types import Venue, Leg
    report['exclusion_controls'] = [dict(name=name, term=term,
        excluded=allergen_excluded(Venue('control', name, 21.0285, 105.8522), (term,)))
        for name, term in [('Cà phê Hà Nội','ca'), ('Trà sữa A','sữa'), ('Mắm tôm','tom')]]
    class Routes:
        def leg(self, a, b): return Leg(5, .3, 'provider_route')
    routes = Routes()
    pool = [Venue(f'v{i}', f'[SYNTHETIC] Phở {i}', 21.0285+i*.001,105.8522, synthetic=True,
                  hours={0:((0,1440),)}, price_evidence='verified', price_min_vnd=30000, price_max_vnd=60000)
            for i in range(1,5)]
    prefs = Preferences(origin=(21.0285,105.8522), weekday=0, start_time_min=600,duration_min=240,max_stops=3)
    report['planner_controls'] = []
    for p in (prefs, replace(prefs,allergies=('cua',)),replace(prefs,allergies=('cua',),mode='strict')):
        tour = engine.plan_tour(pool,p,routes)
        report['planner_controls'].append(dict(allergies=p.allergies,mode=p.mode,status=tour.status,
            unknowns=tour.unknowns,checker=engine.validate_tour(tour,pool,p,routes)))
    clean_tour=engine.plan_tour(pool,prefs,routes)
    crab_pool=[replace(v,name='[SYNTHETIC] Cua' if v.id=='v1' else v.name) for v in pool]
    crab_tour=engine.plan_tour(crab_pool,prefs,routes)
    report['checker_controls'] = dict(ineligible=engine.validate_tour(crab_tour,crab_pool,replace(prefs,allergies=('cua',)),routes),
        missing_warning=engine.validate_tour(clean_tour,pool,replace(prefs,allergies=('cua',)),routes))
    report['api'] = []
    for text in [unicodedata.normalize('NFD','dị ứng cua'), 'dị\u200b ứng cua',
                 'dị ứng cua và không ăn sữa', 'hai bạn dị ứng khác nhau', OLD[-3],
                 NEW[0], NEW[1], NEW[2], NEW[9],
                 'dị ứng cua và tôm 4 người', 'di ung tom va lac 600k ca nhom luc 18h30']:
        test = AllergyAPI()
        test.setUp()
        try:
            test.ready()
            state = test.message(text)
            test.app, test.client = test.restart()
            restored = test.client.get(test.url, headers=test.headers)
            item = {'text':text, 'preferences': state['preferences'], 'notes':state['notes'],
                    'restart_status':restored.status_code, 'restart_equal':restored.json()['preferences']==state['preferences']}
            if state.get('tour'):
                response = test.client.post(test.url+'/tour/replace', headers=test.headers,
                    json={'base_revision':state['revision'],'venue_id':state['tour']['stops'][0]['venue_id']})
                item.update(replace_status=response.status_code, replace_preferences=response.json().get('preferences'),
                            unknowns=(response.json().get('tour') or {}).get('unknowns'))
                from app.planner import engine
                with test.app.state.sessions.owned(test.session['session_id'], test.session['token']) as stored:
                    item['checker_errors'] = engine.validate_tour(stored.tour, stored.snapshot.venues,
                        stored.preferences, test.app.state.routing)
            report['api'].append(item)
        finally:
            test.doCleanups()
    target = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'docs/reports/CODEX_REVIEW_C0HF_3.probes.json')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for key in ('old','new'):
        for row in report[key]:
            print(key, repr(row['text']), 'A=',row['allergies'],'E=',row['exclusions'],'notes=',row['notes'])


if __name__ == '__main__': main()
