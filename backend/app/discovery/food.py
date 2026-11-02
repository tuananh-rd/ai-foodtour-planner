"""Literal public dish intent and tag evidence; never infer menu items from venue names."""
import re
from app.planner.relevance import fold_uncached
from app.chat import knowledge

PHO_VARIANTS = {'ga': 'gà', 'bo': 'bò', 'cuon': 'cuốn', 'xao': 'xào',
                'chien': 'chiên', 'tron': 'trộn', 'tai': 'tái', 'nam': 'nạm', 'chin': 'chín'}


def food_intent(text):
    folded = fold_uncached(re.sub(r'(?i)(?<!\w)phố(?!\w)', ' ', text))
    matches = []
    for match in re.finditer(r'\bpho(?:\s+(ga|bo|cuon|xao|chien|tron|tai|nam|chin))?\b', folded):
        matches.append((match.start(), match.end(), 'phở' + (' '+PHO_VARIANTS[match[1]] if match[1] else '')))
    # Keep known multi-word dishes instead of reducing every request to a family.
    for entry in knowledge.DISHES:
        key, label = entry[:2]
        if key == 'pho':
            continue
        for match in re.finditer(r'(?<!\w)'+re.escape(key)+r'(?!\w)', folded):
            matches.append((match.start(), match.end(), label.lower()))
    for label, pattern in [('bánh', r'\bbanh\b'), ('tráng miệng', r'trang mieng|dessert'), ('cà phê', r'ca phe|coffee')]:
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
        tag=fold_uncached(tag)
        for phrase in phrases:
            pattern=r'(?<!\w)'+re.escape(phrase)+r'(?!\w)'
            if phrase=='pho':
                pattern=r'(?<!\w)pho(?!\w)(?!\s+(?:cuon|xao|chien|tron)(?!\w))'
            if re.search(pattern,tag):
                return True
    return False
