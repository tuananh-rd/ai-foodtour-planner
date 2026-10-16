"""Regenerate the additive synthetic adversarial corpus (original scenarios untouched)."""
import json
from pathlib import Path
import unicodedata


def main():
    scenarios = []
    def say(text, **expect):
        return {'say': text, 'expect': {'tour': 'none', 'llm_calls_max': 0, **expect}}
    def action(kind, **kwargs):
        return {'action': {'type': kind, **kwargs}, 'expect': {'understanding': 'action', 'tour': 'none', 'llm_calls_max': 0}}
    def add(title, turns, *, area=True):
        scenarios.append({'id': f'ADV-{len(scenarios)+1:02}', 'title': title,
                          'setup': {'fixture': 'chat', 'llm': 'off', 'budget': 20,
                                    'start': {'area': {'district': 'Hoàn Kiếm'} if area else None}}, 'turns': turns})
    add('Repeated question while same slot unresolved', [
        say('Tìm quán phở gần tôi', pending_kind='clarify_slot'),
        say('tôi chưa biết', no_repeat_of_previous_question=True),
        say('tôi vẫn chưa biết', no_repeat_of_previous_question=True)], area=False)
    add('ok after clarify_slot cannot plan', [say('Tìm quán phở gần tôi', pending_kind='clarify_slot'), say('ok')], area=False)
    add('ok after clarify_intent cannot plan', [say('ok', pending_kind='clarify_intent'), say('ok')])
    add('ok after pick_venue cannot plan', [say('tìm quán chè', cards={'min': 2}),
        say('thêm một quán', pending_kind='pick_venue'), say('ok')])
    plan_setup = [say('tìm quán chè', cards={'min': 2}), say('Thêm A'), say('tìm quán phở'), say('Thêm A'),
                  say('tạo lịch đi', pending_kind='clarify_slot'),
                  say('16 giờ đến 18 giờ, đi bộ', pending_kind='confirm_plan')]
    add('ok at confirm_plan resolves explicit confirmation', plan_setup + [
        {'say': 'ok', 'expect': {'intent': 'CONFIRM_YES', 'tour': 'present', 'phase': 'planned', 'llm_calls_max': 0}}])
    add('Old label after location change/new search context', [say('tìm quán phở', label_refs=['A']),
        say('đổi khu vực sang Cầu Giấy', state={'profile.area.value.district': 'Cầu Giấy'}),
        say('Thêm A', blocks_include=['clarify'], state_absent=['shortlist.0']),
        say('tìm quán chè', label_refs=['A']), say('Thêm A', state={'shortlist.0.status': 'considering'})])
    add('Crab allergy survives seafood search', [say('tôi dị ứng cua', state={'allergies.0.term': 'cua'}),
        say('tìm quán hải sản', no_card_name_contains=['cua'], card_flags_all=['allergy_unknown'],
            state={'allergies.0.term': 'cua'})])
    add('Budget flips scope without losing party', [say('4 người, 600k cả nhóm', state={'profile.budget.scope': 'group'}),
        say('500k mỗi người', state={'profile.budget.value': 500000, 'profile.budget.scope': 'per_person', 'profile.party_size.value': 4}),
        say('600k cả nhóm', state={'profile.budget.value': 600000, 'profile.budget.scope': 'group', 'profile.party_size.value': 4})])
    add('Vehicle edit after confirm requires new planning confirmation', plan_setup + [
        {'action': {'type': 'confirm_yes'}, 'expect': {'tour': 'present', 'phase': 'planned', 'understanding': 'action', 'llm_calls_max': 0}},
        say('đổi sang đi ô tô', state={'profile.vehicle.value': 'car'}, blocks_include=['notice'])])
    add('Outside Hanoi retains current location', [say('mình ở Đà Nẵng', intent='OUT_OF_SCOPE',
        state={'profile.area.value.district': 'Hoàn Kiếm'}, text_contains=['Hà Nội'])])
    add('1000 characters preserve allergy at end', [say('a '*495 + 'dị ứng cua', state={'allergies.0.term': 'cua'})])
    add('NFD allergy and avoidance remain distinct', [say(unicodedata.normalize('NFD', 'tôi dị ứng cua'),
        state={'allergies.0.term': 'cua'}), say(unicodedata.normalize('NFD', 'tìm quán hải sản'),
        no_card_name_contains=['cua'], card_flags_all=['allergy_unknown'])])
    add('Duplicate action with same revision rejected without mutation', [action('search', query='chè'),
        {'repeat_request': 1, 'expect': {'status': 409, 'error_code': 'revision_conflict'}}])
    add('Stale A after a new empty search must not add an old result', [say('tìm quán phở', label_refs=['A']),
        action('set_location', location={'district': 'Hà Đông'}),
        say('Quán phở bò quanh Hà Đông trong 300 m', cards={'max': 0}),
        say('Thêm A', blocks_include=['clarify'], state_absent=['shortlist.0'])])
    target = Path(__file__).with_name('scenarios') / 'adversarial.json'
    target.write_text(json.dumps({'version': 1, 'synthetic': True, 'scenarios': scenarios}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
