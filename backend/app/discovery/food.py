"""Literal public dish intent and tag evidence; never infer menu items from venue names."""
import re
import unicodedata
from app.planner.relevance import fold_uncached
from app.chat import knowledge

PHO_VARIANTS = {'ga': 'gà', 'bo': 'bò', 'cuon': 'cuốn', 'xao': 'xào',
                'chien': 'chiên', 'tron': 'trộn', 'tai': 'tái', 'nam': 'nạm', 'chin': 'chín'}
INTENT_LABELS = {'bun': 'bún', 'nem': 'nem', 'tra': 'trà', 'sinh to': 'sinh tố', 'banh': 'bánh'}

# Grammar identifies a food request independently of vocabulary coverage. The
# following noun phrase stays literal, including dishes unknown to our catalog.
_REQUEST = re.compile(r'\b(?:(?:muon|thich|them|can)\s+(?:di\s+)?(?:an|uong|thu)|'
                      r'(?:tim|kiem)(?!\s+hieu)(?:\s+(?:quan|mon))?|goi y(?:\s+(?:mon|quan))?|'
                      r'doi\s+(?:mon(?:\s+sang)?|sang)|cho\s+(?:toi|minh)\s+(?:an|uong))\b|^(?:an|uong)\b')
_STOP = {'o','tai','quanh','gan','khu','quan','duoi','gia','ngan','sach','toi','nay',
         'hom','mai','sang','trua','chieu','luc','vao','cho','nguoi','khong','tranh',
         'tru','nhung','di','nhe','nha','a','co','thoi','giup','minh','diung',
         'it','bot','nhieu','ngon','re','ngot','cay'}


def _request_tokens(text):
    tokens = list(re.finditer(r'\w+', text.casefold()))
    folded = ' '.join(fold_uncached(t.group()) for t in tokens)
    request = _REQUEST.search(folded)
    if request and re.search(r'\b(?:khong|dung|tranh)\s*$', folded[:request.start()]):
        request = None
    return tokens, folded, request


def food_search_requested(text):
    return _request_tokens(text)[2] is not None


def needs_food_clarification(text):
    # Explicit general venue discovery may omit a food filter; "muốn ăn" may not.
    general_venues = re.search(r'\b(?:tim|kiem|goi y)\s+quan\b', fold_uncached(text))
    return food_search_requested(text) and not food_intent(text) and not general_venues


def food_intent(text):
    tokens, request_text, request = _request_tokens(text)
    if request:
        start = len(request_text[:request.end()].split())
        groups, current = [], []
        for index in range(start, len(tokens)):
            word = tokens[index].group()
            folded_word = fold_uncached(word)
            if index > start and re.search(r'[,;.!?]', text[tokens[index-1].end():tokens[index].start()]):
                break
            if folded_word in _STOP or folded_word.isdigit():
                break
            if folded_word in ('va', 'voi', 'kem'):
                if current:
                    groups.append(' '.join(current)); current=[]
                continue
            if not current and folded_word == 'mon':
                continue
            current.append(word)
        if current:
            groups.append(' '.join(current))
        aliases={'coffee':'cà phê','dessert':'tráng miệng'}
        return list(dict.fromkeys(aliases.get(fold_uncached(x), x) for x in groups
                                 if 0 < len(x) <= 80))[:10]
    # Bare known dish names are useful shorthand; incidental mentions elsewhere
    # in a sentence never silently change the main food preference.
    folded = fold_uncached(re.sub(r'(?i)(?<!\w)phố(?!\w)', ' ', text))
    bare = {entry[0] for entry in knowledge.DISHES} | {'tao pho','trang mieng','coffee','dessert'}
    bare |= {'pho '+variant for variant in PHO_VARIANTS}
    if folded not in bare:
        return []
    matches = []
    for match in re.finditer(r'(?<!tao )\bpho(?:\s+(ga|bo|cuon|xao|chien|tron|tai|nam|chin))?\b', folded):
        matches.append((match.start(), match.end(), 'phở' + (' '+PHO_VARIANTS[match[1]] if match[1] else '')))
    # Keep known multi-word dishes instead of reducing every request to a family.
    for entry in knowledge.DISHES:
        key, label = entry[:2]
        if key == 'pho':
            continue
        for match in re.finditer(r'(?<!\w)'+re.escape(key)+r'(?!\w)', folded):
            # Knowledge headings may contain editorial alternatives ("Món bún",
            # "Nem / chả giò"); they are not literal menu evidence to search for.
            matches.append((match.start(), match.end(), INTENT_LABELS.get(key, label.lower())))
    for label, pattern in [('bánh', r'\bbanh\b'), ('tào phớ', r'\btao pho\b'), ('tráng miệng', r'trang mieng|dessert'), ('cà phê', r'ca phe|coffee')]:
        for match in re.finditer(pattern, folded):
            matches.append((match.start(), match.end(), label))
    selected=[]
    for start,end,label in sorted(matches, key=lambda x:(x[0],-(x[1]-x[0]))):
        if not any(start < old_end and end > old_start for old_start,old_end,_ in selected):
            selected.append((start,end,label))
    return list(dict.fromkeys(label for _,_,label in selected))[:10]


def matches_food(venue, food):
    wanted=fold_uncached(food)
    phrases=('che','kem','trang mieng','tao pho','sua chua','banh ngot') if wanted=='trang mieng' else (wanted,)
    # Source dish tags alone establish a match; name/address/ranking are not menu evidence.
    for tag in venue.dish_tags:
        source_tokens=re.findall(r'\w+',unicodedata.normalize('NFC',tag.casefold()))
        for phrase in phrases:
            desired=re.findall(r'\w+',unicodedata.normalize('NFC',(food if phrase==wanted else phrase).casefold()))
            if not desired:continue
            if desired[0] in INTENT_LABELS:
                desired[0]=INTENT_LABELS[desired[0]]
            canonical=next((entry[1].lower() for entry in knowledge.DISHES
                if entry[0]==phrase and fold_uncached(entry[1])==phrase),None)
            if canonical and all(fold_uncached(t)==t for t in desired):
                desired=re.findall(r'\w+',canonical)
            if desired and desired[0]=='pho':
                desired[0]='phô' if len(desired)>1 and fold_uncached(desired[1])=='mai' else 'phở'
            if desired and desired[0]=='phở':
                desired=[desired[0]]+[PHO_VARIANTS.get(t,t) for t in desired[1:]]
            for start in range(len(source_tokens)-len(desired)+1):
                actual=source_tokens[start:start+len(desired)]
                if not all(fold_uncached(a)==fold_uncached(b) and
                    (a==b or fold_uncached(a)==a or fold_uncached(b)==b)
                    for a,b in zip(actual,desired)):
                    continue
                if desired and desired[0]=='phở':
                    before=fold_uncached(source_tokens[start-1]) if start else None
                    after=fold_uncached(source_tokens[start+1]) if start+1<len(source_tokens) else None
                    if before=='tao' or after=='mai':continue
                    if len(desired)==1 and after in ('cuon','xao','chien','tron'):continue
                    # Unaccented source "pho ..." is ambiguous: require soup-family evidence.
                    if actual[0]=='pho' and after and after not in (
                        *PHO_VARIANTS,'chay','dac','truyen','ha','bat','to','nho','lon','nuoc','tron','xao','cuon','chien'):
                        continue
                return True
    return False
