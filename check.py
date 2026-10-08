#!/usr/bin/env python3
"""Validador de JSONs de herói exportados pelo export_official.py.

Uso:
    python check.py                              # valida akai.json (default)
    python check.py static/data/official/akai.json
    python check.py --all                        # valida TODOS os arquivos
    python check.py --all --summary              # só resumo (1 linha por herói)
    python check.py --dir static/data/official   # pasta customizada

Mostra:
    - Estrutura do arquivo (chaves top-level)
    - Hero (URLs, IDs)
    - Stats, Compat, Lore, Meta
    - Skills (com descrição resumida)
    - Counters (com nomes dos heróis referenciados)
    - Alertas de campos vazios/nulos
"""
import argparse
import glob
import json
import os
import sys

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

DEFAULT_FILE = 'static/data/official/akai.json'
DEFAULT_DIR  = 'static/data/official'

# Campos que NÃO devem estar vazios num arquivo completo
CAMPOS_ESPERADOS = [
    ('hero', 'name'),
    ('hero', 'head'),
    ('hero', 'wallpaper'),
    ('stats', 'win'),
    ('stats', 'pick'),
    ('stats', 'ban'),
    ('lore', 'short'),
]

# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def trunc(s, n=80):
    """Corta string em n chars, colapsa \n, mostra (...) se cortado."""
    if s is None:
        return None
    s = str(s).replace('\n', ' ').replace('\r', ' ').strip()
    return s if len(s) <= n else s[:n] + '...'

def fmt_val(v, max_len=80):
    """Formata valor pra exibição segura (aceita None, listas, dicts)."""
    if v is None:
        return 'None'
    if isinstance(v, str):
        return v if len(v) <= max_len else v[:max_len] + '...'
    if isinstance(v, (int, float, bool)):
        return repr(v)
    if isinstance(v, list):
        if not v:
            return '[]'
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False, indent=None)[:max_len]
    return str(v)

def sep(title):
    """Imprime cabeçalho de seção."""
    line = '─' * max(40, len(title) + 4)
    print()
    print(f'┌{line}┐')
    print(f'│ {title:<{len(line) - 2}} │')
    print(f'└{line}┘')

def get_nested(d, *keys):
    """Pega valor aninhado com segurança: get_nested(d, 'hero', 'name')."""
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur

# ─────────────────────────────────────────────────────────────
# ANÁLISE
# ─────────────────────────────────────────────────────────────

def analisar(path, verbose=True):
    """
    Analisa um JSON de herói.
    Retorna dict: {ok, problemas, path, name, sections}
    """
    resultado = {
        'path': path,
        'ok': True,
        'problemas': [],
        'name': '?',
        'sections': {},
    }

    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        resultado['ok'] = False
        resultado['problemas'].append(f'Erro ao abrir/parsear: {e}')
        return resultado

    resultado['name'] = get_nested(d, 'hero', 'name') or '?'
    resultado['sections'] = d

    # Checar campos esperados
    for sec, key in CAMPOS_ESPERADOS:
        val = get_nested(d, sec, key)
        if val in (None, '', [], {}):
            resultado['ok'] = False
            resultado['problemas'].append(f'{sec}.{key} vazio/nulo')

    # Checar skills
    skills = d.get('skills') or []
    if not skills:
        resultado['ok'] = False
        resultado['problemas'].append('sem skills')
    else:
        for i, s in enumerate(skills):
            if not s.get('name') or s.get('name') == 'Reserved String':
                resultado['ok'] = False
                resultado['problemas'].append(f'skill[{i}].name inválido')
            if not s.get('icon'):
                resultado['problemas'].append(f'skill[{i}].icon vazio')
            if not s.get('description'):
                resultado['problemas'].append(f'skill[{i}].description vazia')

    # Checar counters
    counters = d.get('counters') or {}
    for kind in ('strong', 'weak', 'assist'):
        c = counters.get(kind) or {}
        heroes = c.get('heroes') or []
        if heroes:
            nomes_nulos = [h for h in heroes if not h.get('name')]
            if nomes_nulos:
                resultado['problemas'].append(
                    f'counters.{kind}: {len(nomes_nulos)} herói(s) sem nome (rode export sem --only)'
                )

    # Checar meta: strings vazias em listas
    for campo in ('speciality', 'roadsort', 'sort'):
        lista = get_nested(d, 'meta', campo) or []
        if isinstance(lista, list) and any(x == '' for x in lista):
            resultado['problemas'].append(f'meta.{campo} contém strings vazias')

    if verbose:
        imprimir_resultado(d, resultado)

    return resultado


def imprimir_resultado(d, resultado):
    """Imprime o JSON formatado bonito."""
    name = resultado['name']

    print()
    print('═' * 70)
    print(f'  {name}  —  {resultado["path"]}')
    print('═' * 70)

    # Status geral
    if resultado['ok'] and not resultado['problemas']:
        print('✅ Arquivo OK (todos os campos esperados preenchidos)')
    elif resultado['ok']:
        print(f'⚠️  Arquivo OK, mas com {len(resultado["problemas"])} aviso(s)')
    else:
        print(f'❌ Arquivo com {len(resultado["problemas"])} problema(s)')

    # Top-level keys
    sep('CHAVES TOP-LEVEL')
    print('  ' + ', '.join(d.keys()))

    # Hero
    sep('HERO')
    hero = d.get('hero') or {}
    for k, v in hero.items():
        print(f'  {k:<12} {fmt_val(v)}')

    # Stats
    sep('STATS')
    stats = d.get('stats') or {}
    for k in ('win', 'pick', 'ban'):
        print(f'  {k:<6} {fmt_val(stats.get(k))}')

    # Patch / updated
    sep('METADADOS')
    print(f'  patch:   {fmt_val(d.get("patch"))}')
    print(f'  updated: {fmt_val(d.get("updated"))}')
    print(f'  v:       {fmt_val(d.get("v"))}')
    print(f'  source:  {fmt_val(d.get("source"))}')

    # Compat
    sep('COMPAT')
    compat = d.get('compat') or {}
    print(f'  metric: {fmt_val(compat.get("metric"))}')
    for side in ('best', 'worst'):
        items = compat.get(side) or []
        if not items:
            print(f'  {side:<6} (vazio)')
            continue
        print(f'  {side}:')
        for it in items:
            print(f'    • {it.get("hero"):<25} {it.get("value")}')

    # Lore
    sep('LORE')
    lore = d.get('lore') or {}
    short = lore.get('short') or ''
    long_ = lore.get('long') or ''
    print(f'  short ({len(short)} chars): {trunc(short, 100) or "(vazio)"}')
    print(f'  long  ({len(long_)} chars): {trunc(long_, 100) or "(vazio)"}')

    # Meta
    sep('META')
    meta = d.get('meta') or {}
    for k in ('difficulty', 'speciality', 'roadsort', 'sort', 'recommend'):
        print(f'  {k:<12} {fmt_val(meta.get(k))}')
    for k in ('sorticon', 'roadicon'):
        v = meta.get(k)
        print(f'  {k:<12} {trunc(v, 60) if v else "(vazio)"}')

    # Skills
    sep(f'SKILLS ({len(d.get("skills") or [])})')
    for i, s in enumerate(d.get('skills') or []):
        name_ = s.get('name') or '?'
        cd    = s.get('cd')
        cost  = s.get('cost')
        pas   = s.get('is_passive')
        tags  = [t.get('name') for t in s.get('tags') or []]
        sid   = s.get('id')
        icon  = '✅' if s.get('icon') else '❌'
        desc  = s.get('description') or ''

        cd_txt   = 'passiva' if pas else (f'{cd}s' if cd is not None else '?')
        cost_txt = f'{cost} mana' if cost is not None else '-'
        print(f'  [{i}] id={sid} {icon} {name_!r}')
        print(f'       tipo: {"passiva" if pas else "ativa":<8}  cd: {cd_txt:<8}  custo: {cost_txt}')
        print(f'       tags: {tags or "(nenhuma)"}')
        print(f'       desc: {trunc(desc, 100) or "(vazia)"}')
        print()

    # Counters
    sep('COUNTERS')
    counters = d.get('counters') or {}
    for kind in ('assist', 'strong', 'weak'):
        c = counters.get(kind) or {}
        heroes = c.get('heroes') or []
        desc = c.get('desc') or ''
        print(f'  ▸ {kind.upper()} ({len(heroes)} heróis)')
        print(f'    desc: {trunc(desc, 90) or "(vazia)"}')
        for h in heroes:
            hid = h.get('id')
            hname = h.get('name') or '(sem nome)'
            hicon = '🖼️' if h.get('head') else '❌'
            print(f'      {hicon} #{hid:<4} {hname}')
        print()

    # URL
    sep('URL OFICIAL')
    print(f'  {fmt_val(d.get("official_url"))}')

    # Problemas
    if resultado['problemas']:
        sep(f'PROBLEMAS ({len(resultado["problemas"])})')
        for p in resultado['problemas']:
            print(f'  ⚠️  {p}')

    print()
    print('═' * 70)
    print()


# ─────────────────────────────────────────────────────────────
# MODO --all (varredura)
# ─────────────────────────────────────────────────────────────

def varrer_pasta(pasta, summary_only=False):
    """Analisa todos os JSONs da pasta."""
    pattern = os.path.join(pasta, '*.json')
    arquivos = sorted(glob.glob(pattern))

    if not arquivos:
        print(f'❌ Nenhum .json encontrado em {pasta}')
        return

    print(f'\n📂 Analisando {len(arquivos)} arquivo(s) em {pasta}\n')

    ok_count      = 0
    warn_count    = 0
    fail_count    = 0
    problemas_totais = {}

    for path in arquivos:
        r = analisar(path, verbose=not summary_only)

        status = '✅' if r['ok'] and not r['problemas'] else ('⚠️ ' if r['ok'] else '❌')
        if r['ok'] and not r['problemas']:
            ok_count += 1
        elif r['ok']:
            warn_count += 1
        else:
            fail_count += 1

        if summary_only:
            n_p = len(r['problemas'])
            print(f'  {status} {r["name"]:<20} {n_p} problema(s)')

        # Acumula tipos de problema
        for p in r['problemas']:
            # Normaliza pra agrupar
            key = p.split(':')[0].split('[')[0].strip()
            problemas_totais[key] = problemas_totais.get(key, 0) + 1

    print()
    print('═' * 70)
    print(f'  RESUMO')
    print('═' * 70)
    print(f'  ✅ OK:       {ok_count}')
    print(f'  ⚠️  Avisos:   {warn_count}')
    print(f'  ❌ Falhas:   {fail_count}')
    print(f'  📦 Total:    {len(arquivos)}')
    print()

    if problemas_totais:
        print('  Tipos de problema mais comuns:')
        for k, v in sorted(problemas_totais.items(), key=lambda x: -x[1]):
            print(f'    {v:>3}x  {k}')
        print()


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description='Valida JSONs de herói exportados.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('path', nargs='?', default=None,
                   help='arquivo específico (default: akai.json)')
    p.add_argument('--all', action='store_true',
                   help='analisa todos os JSONs da pasta')
    p.add_argument('--summary', action='store_true',
                   help='com --all, mostra só 1 linha por herói')
    p.add_argument('--dir', default=DEFAULT_DIR,
                   help=f'pasta dos JSONs (default: {DEFAULT_DIR})')

    args = p.parse_args()

    if args.all:
        varrer_pasta(args.dir, summary_only=args.summary)
        return

    path = args.path
    if not path:
        # Tenta achar akai.json
        if os.path.exists(DEFAULT_FILE):
            path = DEFAULT_FILE
        else:
            # Procura qualquer .json
            candidatos = glob.glob(os.path.join(args.dir, '*.json'))
            if not candidatos:
                print(f'❌ Nenhum JSON encontrado. Passe um caminho ou use --dir.')
                sys.exit(1)
            path = candidatos[0]
            print(f'(usando {path})')

    if not os.path.exists(path):
        print(f'❌ Arquivo não encontrado: {path}')
        sys.exit(1)

    r = analisar(path, verbose=True)
    sys.exit(0 if r['ok'] else 1)


if __name__ == '__main__':
    main()