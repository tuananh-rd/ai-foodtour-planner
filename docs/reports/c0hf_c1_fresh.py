"""Fresh clause-parser boundary probes on synthetic utterances only."""
from dataclasses import asdict
import json
from pathlib import Path
from app.llm.safety_parse import parse
from app.llm.extract import MockExtractor
texts = [
 'dị ứng cua không ăn sữa dị ứng tôm',
 'không dị ứng cua dị ứng sữa không ăn lạc',
 'dị ứng cua và tôm 4 người, kiêng sữa dị ứng lạc',
 'dị ứng cua và dị ứng', 'dị ứng cua, dị ứng rất nặng',
 'dị ứng cua nhưng hết dị ứng sữa rồi',
 'dị ứng cua và tôm nhưng không dị ứng sữa',
 'dị ứng cua\rkhông ăn sữa', 'dị ứng cua\tkiêng sữa',
 'dị ứng cua, xyzabc', 'dị ứng cua và kiwi',
]
rows=[]
for text in texts:
 r=MockExtractor().extract(text)
 rows.append({'text':text,'parse':asdict(parse(text)), 'allergies':r.preferences.allergies,
 'exclusions':r.preferences.exclusions,'notes':r.notes})
Path('docs/reports/C0HF_C1_FRESH.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
for row in rows: print(json.dumps(row,ensure_ascii=False))
