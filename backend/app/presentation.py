"""Plain professional display text; never mutate source records or identifiers."""
import re


# Pictographs, flags/modifiers, legacy emoji symbols and sequence components.
# Match keycaps as a unit so their digit is not left as an invented fact.
_EMOJI = re.compile(
    r'[0-9#*]\ufe0f?\u20e3|['
    r'\U0001f000-\U0001faff\U000e0020-\U000e007f'
    r'\u00a9\u00ae\u203c\u2049\u2122\u2139'
    r'\u2194-\u2199\u21a9-\u21aa\u231a-\u231b\u2328\u2388\u23cf'
    r'\u23e9-\u23f3\u23f8-\u23fa\u24c2\u25aa-\u25ab\u25b6\u25c0'
    r'\u25fb-\u27bf\u2934-\u2935\u2b05-\u2b07\u2b1b-\u2b1c\u2b50\u2b55'
    r'\u3030\u303d\u3297\u3299\ufe0e\ufe0f\u200d\u20e3]'
)


def plain_text(text: str) -> str:
    """Remove emoji sequences while retaining Vietnamese, numbers and line breaks."""
    return re.sub(r'[ \t]{2,}', ' ', _EMOJI.sub('', text)).strip()
