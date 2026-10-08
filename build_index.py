#!/usr/bin/env python3
"""Gera static/data/official/index.json — lista compacta de todos os heróis.

Uso:
  python build_index.py
  python build_index.py --dir static/data/official
"""
import argparse
import glob
import json
import os
import sys


def tier_from_win(win):
    """Proxy de tier — será sobreposto pelo meta da comunidade no frontend."""
    if win is None:
        return None
    if win >= 52.5: return 'S'
    if win >= 50.5: return 'A'
    if win >= 48.5: return 'B'
    return 'C'


def difficulty_bucket(v):
    """'30' → 'easy' | '55' → 'medium' | '85' → 'hard'."""
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    if n < 33: return 'easy'
    if n < 66: return 'medium'
    return 'hard'


def build(src_dir, out_path):
    entradas = []
    updated_max = None

    for path in sorted(glob.glob(os.path.join(src_dir, '*.json'))):
        if os.path.basename(path) == 'index.json':
            continue
        try:
            with open(path, encoding='utf-8') as f:
                d = json.load(f)
        except (OSError, ValueError) as e:
            print(f'  ! {path}: {e}', file=sys.stderr)
            continue

        hero = d.get('hero') or {}
        if not hero.get('name'):
            continue

        u = d.get('updated')
        if u and (not updated_max or u > updated_max):
            updated_max = u

        meta  = d.get('meta')  or {}
        stats = d.get('stats') or {}
        ctrs  = d.get('counters') or {}

        # Ano de lançamento estimado pela skin mais antiga (fallback do hero_id)
        skins = d.get('skins') or []
        first_skin = next(
            (s.get('released') for s in sorted(skins, key=lambda x: x.get('released') or '9999')),
            None
        )
        released_year = first_skin[:4] if first_skin else None

        entradas.append({
            'slug':        os.path.splitext(os.path.basename(path))[0],
            'name':        hero['name'],
            'hero_id':     hero.get('hero_id'),
            'head':        hero.get('head'),
            'square':      hero.get('square'),
            'wallpaper':   hero.get('wallpaper'),
            'roles':       meta.get('sort') or [],
            'lanes':       meta.get('roadsort') or [],
            'speciality':  meta.get('speciality') or [],
            'difficulty':  meta.get('difficulty'),
            'difficulty_bucket': difficulty_bucket(meta.get('difficulty')),
            'released_year': released_year,
            'win':         stats.get('win'),
            'pick':        stats.get('pick'),
            'ban':         stats.get('ban'),
            'tier':        tier_from_win(stats.get('win')),
            'num_skills':  len(d.get('skills') or []),
            'num_skins':   len(d.get('skins') or []),
            'num_counters': {
                k: len(((ctrs.get(k) or {}).get('heroes')) or [])
                for k in ('strong', 'weak', 'assist')
            },
        })

    entradas.sort(key=lambda x: x['name'].lower())

    payload = {
        'v': 2,
        'updated': updated_max,
        'total': len(entradas),
        'heroes': entradas,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    kb = os.path.getsize(out_path) / 1024
    print(f'✓ {out_path} — {len(entradas)} heróis, {kb:.1f} KB')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dir', default='static/data/official')
    p.add_argument('--out', default=None)
    args = p.parse_args()
    out = args.out or os.path.join(args.dir, 'index.json')
    build(args.dir, out)


if __name__ == '__main__':
    main()