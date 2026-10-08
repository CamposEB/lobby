"""Mostra as skins de um herói de forma legível."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'static/data/official/akai.json'
d = json.load(open(path, encoding='utf-8'))

print(f'Arquivo: {path}')
print(f'Herói:   {(d.get("hero") or {}).get("name")}')
print(f'Total:   {len(d.get("skins") or [])} skin(s)')
print()

for i, s in enumerate(d.get('skins') or [], 1):
    data = s.get('released') or '?'
    nome = s.get('name') or '?'
    tag = ' ⭐ original' if s.get('is_original') else ''
    print(f'  [{i:>2}] {data}  {nome:<25}{tag}')
    print(f'       {s.get("image_filename")}')