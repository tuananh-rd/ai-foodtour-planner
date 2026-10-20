"""One conversation/tool stream with deterministic authority, validation and useful bounded fallback."""
import copy
import json
import re
import time
from app.assistant.conversation import (redact_sensitive, RE_ALLERGY_CLEARANCE,
    RE_OPERATIONAL_CLAIM, RE_ETA_CLAIM, RE_AGENT_ROLEPLAY, RE_INSTRUCTION_LEAKAGE)
from app.chat.understand import parse_slots
from app.chat import knowledge
from app.chat.conversation_reply import private_turn
from app.assistant.conversation import is_health_or_allergy_disclosure
from app.llm import safety_parse
from app.llm.provider import ProviderError
from app.presentation import plain_text
from app.planner.relevance import fold_uncached
from .tools import DISTRICT_LABELS


def knowledge_question(text):
    f = fold_uncached(text)
    return bool(re.search(r'la gi|nguon goc|lich su|cach nau|khac (?:gi|nhau)', f)) and not re.search(
        r'\b(?:tim|quan|dia chi)\b|muon an|goi y|o dau', f)


def parse_patch(text, tools):
    f = fold_uncached(text)
    raw = parse_slots(text, f, tools.preferences())
    allowed = ('party_size', 'budget_vnd', 'budget_scope', 'start_time', 'end_time', 'duration_min', 'vehicle', 'max_leg_min')
    patch = {k: raw[k] for k in allowed if k in raw}
    # Bare numbers are meaningful only in the one outstanding server question.
    bare = re.fullmatch(r'\s*(\d{1,3})\s*[.!]?\s*', f)
    if bare and tools.state.plan_requested:
        number = int(bare.group(1))
        slot = tools.state.pending_slot
        if slot == 'party_size' and 1 <= number <= 20:
            patch['party_size'] = number
        elif slot == 'duration_min' and 30 <= number <= 720:
            patch['duration_min'] = number
        elif slot == 'start_time' and 0 <= number <= 23:
            patch['start_time'] = f'{number:02d}:00'
    # A discovery price filter is not the trip budget.
    price_search = bool(re.search(r'\bduoi\s*\d+\s*(?:k|nghin|ngan)', f) and
                        re.search(r'\b(?:tim|quan|pho|bun|che|banh)\b', f) and 'ngan sach' not in f)
    if price_search:
        patch.pop('budget_vnd', None)
        patch.pop('budget_scope', None)
    if 'budget_vnd' in patch and not re.search(r'moi nguoi|per person|dau nguoi', f) and re.search(r'cho\s*\d+\s*nguoi', f):
        patch['budget_scope'] = 'group'
    place = tools.gz.resolve(text)
    explicit_street = bool(re.search(r'(?i)(?<!\w)(?:phố|đường)(?!\w)', text))
    district_label = next((label for key, label in DISTRICT_LABELS.items() if tools.gz._has(f, key)), None)
    if district_label and not explicit_street:
        place = tools.gz.districts.get(fold_uncached(district_label))
    districts = [(len(k), p) for k, p in tools.gz.districts.items() if tools.gz._has(f, k)]
    if districts and not re.search(r'(?i)(?<!\w)(?:phố|đường)(?!\w)', text):
        place = max(districts, key=lambda row: row[0])[1]
    if place:
        patch['area'] = ('Phố ' if explicit_street and place.kind == 'street' else '') + place.label
        if re.search(r'xuat phat|bat dau tu|di tu|^tu\s', f) or (tools.state.plan_requested and tools.state.pending_slot == 'origin'):
            patch['origin'] = {'lat': float(place.lat), 'lon': float(place.lon)}
    else:
        # A named area is valid preference intent even outside our local catalog.
        # In particular, "ở Hai Bà Trưng" must replace a stale Phố cổ filter.
        m = re.search(r'(?<!\w)(?:quanh|khu vuc|gan|tai|o)\s+(?:(?:sang|thanh|la)\s+)?(.+?)(?:\s+(?:co|tim|duoi|toi nay|thi|khong)\b|[,;?.]|$)', f)
        if m:
            candidate = m.group(1).strip()
            if candidate not in ('day', 'do', 'toi', 'minh') and len(candidate) > 2:
                patch['area'] = candidate[:120]
    if district_label and not explicit_street:
        patch['area'] = district_label
    foods = food_intent(text)
    if foods:
        patch['foods'] = foods
    if re.search(r'gan day|quanh day|gan toi|gan minh', f):
        patch['area'] = None
    taste_map = {'it ngot': 'ít ngọt', 'bot ngot': 'bớt ngọt', 'it duong': 'ít đường', 'khong cay': 'không cay',
                 'it cay': 'ít cay', 'an nhat': 'ăn nhạt', 'it man': 'ít mặn'}
    tastes = [v for k, v in taste_map.items() if k in f]
    if tastes:
        patch['tastes'] = list(dict.fromkeys(tools.state.profile.tastes + tastes))[:10]
    safety = safety_parse.parse(text)
    if safety.allergies:
        patch['allergies'] = list(dict.fromkeys(tools.state.profile.allergies + safety.allergies))[:10]
    elif re.search(r'\bdi ung\b', f) and not re.search(r'khong (?:bi |co )?di ung', f):
        patch['allergies'] = list(dict.fromkeys(tools.state.profile.allergies + ['chưa xác định tác nhân']))[:10]
    if safety.avoid:
        patch['exclusions'] = list(dict.fromkeys(tools.state.profile.exclusions + safety.avoid))[:10]
    if safety.removed:
        patch['allergies'] = [a for a in tools.state.profile.allergies if a not in safety.removed]
    if knowledge_question(text):
        # Mentioning a dish/place while asking what it is does not change food
        # search intent or erase visible cards. Explicit safety/trip edits remain local.
        for key in ('area', 'foods', 'tastes'):
            patch.pop(key, None)
    return patch, price_search


def references(text, tools, result_ids=None):
    result_ids = tools.state.results if result_ids is None else result_ids
    ids = []
    for match in re.finditer(r'(?<!\w)([A-E])(?!\w)', text, re.I):
        index = ord(match.group(1).upper()) - 65
        if index < len(result_ids):
            ids.append(result_ids[index])
    f = fold_uncached(text)
    for identity in set(result_ids) | {x['id'] for x in tools.state.selection}:
        if identity in tools.by_id and fold_uncached(tools.by_id[identity].name) in f:
            ids.append(identity)
    return list(dict.fromkeys(ids))[:5]


def selection_references(text, tools, result_ids):
    # Bind each mutation only to its own clause, e.g. compare A/B then add A.
    parts = re.split(r'(?i)\s+(?:và|rồi|sau đó|va|roi)\s+|[,;.!?]', text)
    patterns = {'add': r'\b(?:them|chon|lay)\b', 'remove': r'\b(?:bo|xoa)\b',
                'lock': r'\b(?:khoa|giu)\b', 'unlock': r'mo khoa|bo giu'}
    bound = {key: [] for key in patterns}
    previous = None
    for part in parts:
        folded = fold_uncached(part)
        operation = next((key for key in ('unlock', 'remove', 'add', 'lock') if re.search(patterns[key], folded)), None)
        if operation and re.search(r'\b(?:khong|dung|chua)\s+(?:duoc\s+)?(?:them|chon|lay|bo|xoa|khoa|giu)', folded):
            previous = None
            continue
        if operation is None and previous and re.fullmatch(r'\s*[a-e](?:\s+vao\s+(?:chuyen di|tour|danh sach))?\s*', folded):
            operation = previous
        if operation:
            bound[operation].extend(references(part, tools, result_ids))
        previous = operation
    return {key: list(dict.fromkeys(ids)) for key, ids in bound.items()}


def authorized(name, args, text, tools, patch, initial_refs):
    f = fold_uncached(text)
    if name == 'update_preferences':
        def same(key, value):
            if key not in patch:
                return False
            if key == 'area' and isinstance(value, str):
                return fold_uncached(value) == fold_uncached(patch[key])
            return patch[key] == value
        return bool(args.get('patch')) and all(same(k, v) for k, v in args['patch'].items())
    if name == 'update_foodtour_selection':
        cues = {'add': r'\bthem|chon|lay\b', 'remove': r'\bbo|xoa\b', 'lock': r'\bkhoa|giu\b', 'unlock': r'mo khoa|bo giu'}
        allowed = getattr(tools, 'selection_refs', {}).get(args.get('operation'), initial_refs)
        return bool(re.search(cues.get(args.get('operation'), r'(?!)'), f)) and set(args.get('venue_ids', [])) <= set(allowed)
    if name in ('create_itinerary', 'revise_itinerary'):
        return bool(re.search(r'tao lich|lap lich|tao tour|lap tour|len lich|sap lich|tinh lai lich|sua lich', f))
    if name == 'search_restaurants':
        # Bounded read-only lookup is not a preference/selection mutation.
        # The server binds effective filters to the user's parsed preferences below.
        return True
    if name in ('get_restaurant_details', 'compare_restaurants'):
        requested = [args['venue_id']] if name == 'get_restaurant_details' else args['venue_ids']
        known = set(initial_refs) | set(tools.state.results) | {x['id'] for x in tools.state.selection}
        return bool(requested) and set(requested) <= known
    return False


def local_dish_phrases(dish):
    from app.chat.tools import dish_phrases
    return dish_phrases(dish)


def food_intent(text):
    """Bounded public food categories; no location, health or model authority."""
    f = fold_uncached(re.sub(r'(?i)(?<!\w)phố(?!\w)', ' ', text))
    groups = [('phở', r'\bpho\b'), ('bún', r'\bbun\b'), ('bánh', r'\bbanh\b'),
              ('chè', r'\bche\b'), ('tráng miệng', r'trang mieng|dessert'),
              ('cà phê', r'ca phe|coffee')]
    return [label for label, pattern in groups if re.search(pattern, f)]


def fallback(text, tools, patch, price_search, initial_refs=None):
    f = fold_uncached(text)
    results = []
    refs = references(text, tools) if initial_refs is None else initial_refs
    if re.fullmatch(r'\s*xac nhan (?:tao|lap) (?:lich|tour)(?: trinh)?\s*[.!]*', f) and tools.state.confirmation:
        return tools.confirm(tools.state.confirmation['id'])
    if re.search(r'\b(?:them|chon)\b', f):
        add_refs = getattr(tools, 'selection_refs', {}).get('add', refs)
        if not add_refs:
            return tools.result('unknown', 'Chưa thêm quán vì chưa xác định được đúng lựa chọn.', 'Bạn muốn thêm quán nào trong các kết quả vừa xem?')
        added = tools.run('update_foodtour_selection', {'operation': 'add', 'venue_ids': add_refs,
                    'selection_version': tools.state.selection_version})
        results.append(added)
        if added['status'] != 'ok':
            return added
        if re.search(r'\bso sanh\b', f) and len(refs) >= 2:
            compared = tools.run('compare_restaurants', {'venue_ids': refs})
            compared['text'] = added['text'] + ' ' + compared['text']
            results.append(compared)
    elif re.search(r'\b(?:bo|xoa)\s+(?:quan|[a-e])\b', f) and refs:
        remove_refs = getattr(tools, 'selection_refs', {}).get('remove', refs)
        if not remove_refs:
            return tools.result('ok', 'Các quán đã chọn được giữ nguyên.')
        return tools.run('update_foodtour_selection', {'operation': 'remove', 'venue_ids': remove_refs,
                        'selection_version': tools.state.selection_version})
    elif re.search(r'\bso sanh\b', f):
        if len(refs) < 2:
            return tools.result('unknown', 'Có thể so sánh các dữ liệu quán đã xem; tiêu chí chưa có dữ liệu sẽ ghi chưa rõ.', 'Bạn muốn so sánh hai quán nào?')
        return tools.run('compare_restaurants', {'venue_ids': refs})
    elif re.search(r'chi tiet|thong tin|xem quan', f) and refs:
        if len(refs) > 1:
            return tools.result('unknown', 'Mình có thể xem chi tiết một quán đã hiển thị.', 'Bạn muốn xem quán nào trước?')
        return tools.run('get_restaurant_details', {'venue_id': refs[0]})
    plan_cue = bool(re.search(r'tao lich|lap lich|tao tour|lap tour|len lich|sap lich|tinh lai lich|sua lich', f))
    if plan_cue or (tools.state.plan_requested and patch):
        return tools.run('create_itinerary', {})
    if re.search(r'\b(?:ok|oke|okay|vang|duoc)\b', f) and len(f.split()) <= 3:
        return tools.result('ok', 'Mình giữ các thông tin đã có; câu này chưa được coi là xác nhận tạo lịch.')
    dish = knowledge.lookup_dish(f)
    search_cue = re.search(r'\b(?:tim|quan|quanh|gan|o dau|dia chi)\b', f) or (
        food_intent(text) and re.search(r'muon an|goi y|\bo\s|\btai\s', f))
    if tools.state.pending_search and patch.get('area') and not search_cue and not dish:
        return tools.run('search_restaurants', {**tools.state.pending_search, 'area': tools.state.profile.area})
    if search_cue or (dish and results):
        # Lookup selects the most specific dish mentioned (e.g. add A then find chè).
        dish_name = dish[1] if dish else None
        max_price = None
        if price_search:
            m = re.search(r'duoi\s*(\d+)\s*(k|nghin|ngan)', f)
            max_price = int(m.group(1)) * 1000 if m else None
        found = tools.run('search_restaurants', {'dish': dish_name, 'area': tools.state.profile.area,
                                                'max_price_vnd': max_price})
        if results:
            found['text'] = results[0]['text'] + ' ' + found['text']
        return found
    if results:
        return results[-1]
    if 'thoi tiet' in f or 'troi mua' in f:
        return tools.result('unknown', 'Hiện chưa có dữ liệu thời tiết; mình vẫn có thể giúp khám phá món và dữ liệu quán.')
    if dish and knowledge_question(text):
        return tools.result('ok', 'Kiến thức món nói chung: ' + dish[2] + ' Đây không phải xác nhận món hay nguyên liệu tại một quán cụ thể.')
    if patch:
        return tools.result('ok', 'Đã ghi nhận phần bạn vừa sửa, các yêu cầu khác và lựa chọn vẫn được giữ.')
    if dish:
        return tools.result('ok', 'Kiến thức món nói chung: ' + dish[2] + ' Đây không phải xác nhận món hay nguyên liệu tại một quán cụ thể.')
    if re.search(r'\b(?:chao|hello|hi|cam on)\b', f):
        return tools.result('ok', 'Chào bạn! Mình có thể cùng bạn khám phá món, tìm quán, so sánh rồi chọn lịch trình khi bạn muốn; chưa cần điền thông tin chuyến đi.')
    return tools.result('ok', 'Mình có thể giúp khám phá món, tìm và so sánh quán trong dữ liệu Hà Nội. Các yêu cầu đã biết và quán đã chọn vẫn được giữ.')


def model_projection(tools, text):
    profile = tools.state.profile.model_dump(exclude={'origin', 'allergies', 'exclusions'})
    # No stored record-derived assistant history, no exact GPS or health to provider.
    safe_text = redact_sensitive(text)
    safe_text = re.sub(r'(?i)(?:dị\s*ứng|di ung)[^,.;!?]*', '[thông tin sức khỏe xử lý tại máy]', safe_text)
    history = [{'role': x['role'], 'text': x['text']} for x in tools.state.messages
               if x['role'] == 'user' and not private_turn(x['text'])
               and not is_health_or_allergy_disclosure(x['text'])][-4:]
    return {'message': safe_text[:1000], 'profile': profile,
            'origin_selected': tools.state.profile.origin is not None, 'recent_public_user_turns': history,
            'selection': [{'id': x['id'], 'locked': x['locked']} for x in tools.state.selection],
            'last_results': [{'id': i, 'label': chr(65+n)} for n, i in enumerate(tools.state.results)],
            'versions': {'profile': tools.state.profile_version, 'selection': tools.state.selection_version}}


def tool_projection(result):
    def redact(value):
        if isinstance(value, dict):
            return {k: redact(v) for k, v in value.items() if k not in (
                'lat', 'lon', 'origin', 'allergies', 'source_url',
                'distance_m', 'distance_source', 'distance_reason')}
        if isinstance(value, list):
            return [redact(x) for x in value[:5]]
        return redact_sensitive(value)[:500] if isinstance(value, str) else value
    return redact(result)


def safe_answer(text, tools, tool_results):
    if isinstance(text, str):
        text = plain_text(text)
    if not isinstance(text, str) or not text.strip() or len(text) > 1200 or '?' in text:
        return None
    if any(pattern.search(text) for pattern in (RE_ALLERGY_CLEARANCE, RE_OPERATIONAL_CLAIM, RE_ETA_CLAIM,
                                               RE_AGENT_ROLEPLAY, RE_INSTRUCTION_LEAKAGE)):
        return None
    f = fold_uncached(text)
    for cue, operation in ((r'da them', 'add'), (r'da (?:bo|xoa)', 'remove'), (r'da khoa', 'lock'), (r'da mo khoa', 'unlock')):
        if re.search(cue, f) and not any(x.get('_mutation_success') and x.get('_operation') == operation for x in tool_results):
            return None
    if re.search(r'da luu', f):
        return None  # no save-trip feature/tool exists
    if re.search(r'da (?:tao|chot|lap).*(?:lich|tour)', f) and not (tools.planned_tour and tools.planned_tour.stops):
        return None
    if re.search(r'gia.*\d|\d.*(?:moi nguoi|mot suat|mot bat)|dang mo|an toan di ung', f):
        return None
    allowed = json.dumps([tools.state.profile.model_dump(), tool_results], ensure_ascii=False)
    if not set(re.findall(r'\d+', text)) <= set(re.findall(r'\d+', allowed)):
        return None
    if redact_sensitive(text) != text:
        return None
    return text.strip()


def handle(text, tools, *, model=None, llm_used=0, session_cap=6, reserve=3):
    start = time.monotonic()
    initial_refs = references(text, tools)
    initial_results = list(tools.state.results)
    tools.selection_refs = selection_references(text, tools, initial_results)
    patch, price_search = parse_patch(text, tools)
    if patch:
        changed = tools.run('update_preferences', {'patch': patch})
        if changed['status'] != 'ok':
            return changed, {'mode': 'rules', 'calls': 0, 'reason': 'invalid_patch'}
    mode = getattr(model, 'mode', 'gemini') if model is not None and model.configured else 'rules'
    provider = {'mode': mode, 'calls': 0, 'reply_source': 'rules' if mode == 'rules' else 'tools'}
    if private_turn(text) or is_health_or_allergy_disclosure(text):
        # Health, precise personal location, contacts and credentials stay local.
        return fallback(text, tools, patch, price_search, initial_refs), {'mode': 'rules', 'calls': 0, 'reason': 'private_turn', 'reply_source': 'rules'}
    if mode == 'rules':
        return fallback(text, tools, patch, price_search, initial_refs), provider
    # Confirmation is server-only. Even an enabled model cannot consume its own nonce.
    if re.fullmatch(r'\s*xac nhan (?:tao|lap) (?:lich|tour)(?: trinh)?\s*[.!]*', fold_uncached(text)):
        return fallback(text, tools, patch, price_search, initial_refs), provider
    projection = model_projection(tools, text)
    projection['turn_start_results'] = [{'id': identity, 'label': chr(65+n)} for n, identity in enumerate(initial_results)]
    contents = [{'role': 'user', 'parts': [{'text': json.dumps(projection, ensure_ascii=False)}]}]
    tool_results = []
    last = None
    try:
        for _ in range(2):
            remaining = 12 - (time.monotonic() - start)
            if remaining <= .1 or llm_used + provider['calls'] >= session_cap:
                raise ProviderError('quota')
            client = getattr(model, 'client', None)
            if client and client.budget.snapshot()['remaining'] <= reserve:
                raise ProviderError('quota')
            # Count conservatively before calling, including provider/schema/timeout failures.
            provider['calls'] += 1
            content = model.generate(copy.deepcopy(contents), deadline_s=remaining)
            if not isinstance(content, dict) or content.get('role') != 'model' or not isinstance(content.get('parts'), list):
                raise ProviderError('bad_response')
            calls = [p['functionCall'] for p in content['parts'] if isinstance(p, dict) and 'functionCall' in p]
            if not calls:
                candidate = ''.join(p.get('text', '') for p in content['parts'] if isinstance(p, dict) and not p.get('thought'))
                valid = safe_answer(candidate, tools, tool_results)
                if last is None:
                    # A factual search or action may never be replaced by an unsupported model answer.
                    deterministic = fallback(text, tools, patch, price_search, initial_refs)
                    if tools.calls or deterministic['status'] != 'ok':
                        return deterministic, provider
                    provider['reply_source'] = 'model' if valid else 'rules'
                    return tools.result('ok', valid or deterministic['text']), provider
                if valid and last['status'] in ('ok', 'unknown', 'no_results'):
                    last['text'] = valid
                    provider['reply_source'] = 'model'
                return last, provider
            if len(calls) > 6 or tools.calls + len(calls) > 6:
                raise ProviderError('bad_response')
            contents.append(content)  # exact parts/signatures preserved, never persisted
            responses = []
            for call in calls:
                name, args = call.get('name'), call.get('args', {})
                from .schemas import TOOL_INPUTS
                try:
                    TOOL_INPUTS[name].model_validate(args)
                    permitted = authorized(name, args, text, tools, patch, initial_refs)
                except (ValueError, KeyError, TypeError, AttributeError):
                    permitted = False
                if not permitted:
                    result = tools.result('tool_error', 'Yêu cầu công cụ chưa được người dùng cho phép; chưa thay đổi dữ liệu.')
                else:
                    if name == 'search_restaurants':
                        args = {**args, 'area': tools.state.profile.area}
                        limit = re.search(r'duoi\s*(\d+)\s*(k|nghin|ngan)', fold_uncached(text))
                        args['max_price_vnd'] = int(limit.group(1))*1000 if limit else (
                            (tools.state.last_search or {}).get('max_price_vnd'))
                    result = tools.run(name, args)
                    if result['status'] == 'ok' and name in ('update_preferences', 'update_foodtour_selection'):
                        result['_mutation_success'] = True
                        result['_operation'] = args.get('operation')
                last = result
                tool_results.append(result)
                response = {'name': name, 'response': tool_projection(result)}
                if call.get('id'):
                    response['id'] = call['id']
                responses.append({'functionResponse': response})
            contents.append({'role': 'user', 'parts': responses})
        provider['reason'] = 'turn_call_cap'
        return last or tools.result('unavailable', 'Lượt xử lý đã đạt giới hạn; các thay đổi đã kiểm chứng vẫn được giữ.'), provider
    except (ProviderError, TimeoutError, ValueError, TypeError, KeyError, AttributeError) as error:
        provider['reason'] = getattr(error, 'kind', 'timeout' if isinstance(error, TimeoutError) else 'tool_error')
        if last is not None:
            last['text'] += ' Model chưa hoàn tất phần giải thích; kết quả công cụ đã xác thực vẫn được giữ.'
            return last, provider
        # Budget exhaustion must not turn local discovery into a dead end. This
        # is the same deterministic fallback, never a second model/extractor.
        local = fallback(text, tools, patch, price_search, initial_refs)
        local['text'] = 'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. ' + local['text']
        provider['reason'] += '_rules_fallback'
        provider['mode'] = 'rules'
        provider['reply_source'] = 'rules'
        return local, provider
