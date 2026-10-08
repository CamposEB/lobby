#!/usr/bin/env python3
"""Extrai as skins de cada herói do MLBBHub (mlbbhub.com) e mescla nos
JSONs existentes em static/data/official/.

As skins NÃO estão mais expostas na API oficial da Moonton — o MLBBHub
(que também usa as APIs oficiais) as serve via SSR no HTML da página
de cada herói, apontando pra um CDN próprio (esportpedia.b-cdn.net).

Este script:
  1. Lê a lista de heróis dos JSONs existentes
  2. Baixa o HTML de https://mlbbhub.com/pt/heroes/<slug>
  3. Extrai as URLs de skin do CDN
  4. Filtra portraits (HeroNNN-portrait-*)
  5. Deriva nome legível + data de cada skin
  6. Mescla o array "skins" no JSON sem tocar no resto

Uso:
  python export_skins.py                             # todos os heróis
  python export_skins.py --hero akai                 # só um
  python export_skins.py --dry-run                   # não grava
  python export_skins.py --refresh                   # ignora cache HTML
  python export_skins.py --delay 1.5                 # mais gentil

Cache: os HTMLs baixados ficam em .cache/mlbbhub/<slug>.html.
Remova-os ou use --refresh pra forçar redownload.
"""
import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

BASE = 'https://mlbbhub.com/pt/heroes/'
CDN_HOST = 'esportpedia.b-cdn.net'
CDN_PREFIX = f'https://{CDN_HOST}/mlbbhub/skins/'
CACHE_DIR = os.path.join('.cache', 'mlbbhub')
DEFAULT_OUT = 'static/data/official'

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' \
     '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# URLs de skin: https://esportpedia.b-cdn.net/mlbbhub/skins/<hero>/<file>.webp
# Aceita também png/jpg por segurança.
RE_URL = re.compile(
    r'https://' + re.escape(CDN_HOST) + r'/mlbbhub/skins/([a-z0-9-]+)/([^"\'<>\s)]+\.(?:webp|png|jpg|jpeg))',
    re.IGNORECASE,
)

# Nome: {Hero}-{Skin-Name}-{YYYYMMDDHHMMSS}.webp
RE_NOME = re.compile(r'^(?P<prefixo>[A-Za-z0-9]+)-'
                     r'(?P<meio>.+?)-'
                     r'(?P<ts>\d{14})$')

RE_PORTRAIT = re.compile(r'-portrait-', re.IGNORECASE)


# ═══════════════════════════════════════════════════════════════════════
# HTTP
# ═══════════════════════════════════════════════════════════════════════

def baixar(url, timeout=30):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')


def html_do_heroi(slug, refresh=False):
    """Baixa (ou lê do cache) o HTML da página do herói."""
    cache_path = os.path.join(CACHE_DIR, f'{slug}.html')
    if not refresh and os.path.exists(cache_path):
        try:
            with open(cache_path, encoding='utf-8') as f:
                return f.read()
        except OSError:
            pass

    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        html = baixar(BASE + slug)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f'   ⚠️  {slug}: 404 (herói não existe no MLBBHub)')
            return None
        raise
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(html)
    return html


# ═══════════════════════════════════════════════════════════════════════
# PARSING
# ═══════════════════════════════════════════════════════════════════════

# Slugs que o MLBBHub usa diferente do slug_do_nome() padrão
SLUG_OVERRIDES = {
    "chang'e": 'change',
}

def slug_do_nome(nome):
    """'Akai' -> 'akai' | 'Yu Zhong' -> 'yu-zhong'."""
    chave = (nome or '').lower().strip()
    if chave in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[chave]
    s = re.sub(r'[^a-z0-9]+', '-', nome.lower()).strip('-')
    return s


def humanizar(kebab):
    """'Panda-Warrior' -> 'Panda Warrior'."""
    return ' '.join(w.capitalize() for w in kebab.split('-') if w)


def data_do_ts(ts):
    """'20231104055333' -> '2023-11-04'."""
    try:
        return datetime.strptime(ts, '%Y%m%d%H%M%S').strftime('%Y-%m-%d')
    except ValueError:
        return None


def extrair_skins(html, hero_slug):
    """
    Extrai skins do HTML.

    Retorna lista de dicts:
      {name, name_slug, image, image_filename, released, is_original}
    """
    # Vamos pegar todas as URLs e filtrar:
    #   1. Só do diretório do herói atual (/skins/<hero_slug>/)
    #   2. Excluir portraits (HeroNNN-portrait-*)
    itens = []
    vistos = set()

    for m in RE_URL.finditer(html):
        hero_dir, filename = m.group(1), m.group(2)
        if hero_dir.lower() != hero_slug.lower():
            continue
        if filename in vistos:
            continue
        if RE_PORTRAIT.search(filename):
            continue

        vistos.add(filename)
        base = filename.rsplit('.', 1)[0]   # tira extensão
        mm = RE_NOME.match(base)
        if not mm:
            # Nome fora do padrão — guarda só com o filename
            itens.append({
                'name':           humanizar(base),
                'name_slug':      base,
                'image':          m.group(0),
                'image_filename': filename,
                'released':       None,
                'is_original':    False,
            })
            continue

        meio = mm.group('meio')
        ts = mm.group('ts')
        nome_legivel = humanizar(meio)
        itens.append({
            'name':           nome_legivel,
            'name_slug':      meio,
            'image':          m.group(0),
            'image_filename': filename,
            'released':       data_do_ts(ts),
            'is_original':    False,   # ajustado abaixo
        })

    # Ordena por data (mais antigas primeiro), com as sem data no fim
    itens.sort(key=lambda x: (x['released'] is None, x['released'] or ''))

    # Marca a skin original (a mais antiga costuma ser a default do herói)
    if itens:
        itens[0]['is_original'] = True

    return itens


# ═══════════════════════════════════════════════════════════════════════
# MERGE / ESCRITA
# ═══════════════════════════════════════════════════════════════════════

def merge_skins_no_json(path, skins):
    """
    Mescla o array 'skins' no JSON do herói.
    Preserva todo o resto (stats, skills, counters, lore, etc.).
    """
    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        print(f'   ! erro lendo {path}: {e}')
        return False

    d['skins'] = skins

    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)
    return True


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def processar_heroi(json_path, args):
    with open(json_path, encoding='utf-8') as f:
        d = json.load(f)

    nome = (d.get('hero') or {}).get('name')
    if not nome:
        print(f'   ! {os.path.basename(json_path)}: sem hero.name, ignorando.')
        return None

    slug = slug_do_nome(nome)
    print(f'   🔎 {nome} ({slug})')

    try:
        html = html_do_heroi(slug, refresh=args.refresh)
    except Exception as e:
        print(f'   ! erro baixando HTML: {e}')
        return None

    if not html:
        return None

    skins = extrair_skins(html, slug)
    print(f'   ✓ {len(skins)} skin(s)')

    if args.dry_run:
        for s in skins[:3]:
            print(f'       • {s["name"]}  ({s["released"] or "?"})')
        if len(skins) > 3:
            print(f'       ... e mais {len(skins) - 3}')
        return len(skins)

    if merge_skins_no_json(json_path, skins):
        return len(skins)
    return None


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('--out', default=DEFAULT_OUT,
                   help=f'pasta dos JSONs (default: {DEFAULT_OUT})')
    p.add_argument('--hero', help='processa só este herói (slug do JSON)')
    p.add_argument('--delay', type=float, default=1.0,
                   help='intervalo entre requests (default: 1.0s)')
    p.add_argument('--refresh', action='store_true',
                   help='ignora cache HTML e baixa de novo')
    p.add_argument('--dry-run', action='store_true',
                   help='não grava, só mostra o que faria')
    p.add_argument('--limpar-cache', action='store_true',
                   help='apaga o cache de HTML antes de rodar')
    args = p.parse_args()

    if args.limpar_cache and os.path.isdir(CACHE_DIR):
        import shutil
        shutil.rmtree(CACHE_DIR)
        print(f'🧹 Cache limpo: {CACHE_DIR}')

    if not os.path.isdir(args.out):
        sys.exit(f'❌ Pasta não encontrada: {args.out}')

    # Lista de JSONs (um por herói)
    if args.hero:
        path = os.path.join(args.out, f'{args.hero}.json')
        if not os.path.exists(path):
            sys.exit(f'❌ Arquivo não existe: {path}')
        arquivos = [path]
    else:
        arquivos = sorted(glob.glob(os.path.join(args.out, '*.json')))

    if not arquivos:
        sys.exit(f'❌ Nenhum JSON em {args.out}')

    print(f'\n🎨 Extraindo skins de {len(arquivos)} herói(s)')
    print(f'   Fonte: {BASE}<slug>')
    if args.dry_run:
        print('   MODO DRY-RUN (nada será gravado)')
    print()

    total_skins = 0
    com_skins = 0
    sem_skins = []

    for i, path in enumerate(arquivos, 1):
        print(f'[{i}/{len(arquivos)}] {os.path.basename(path)}')
        try:
            n = processar_heroi(path, args)
            if n:
                total_skins += n
                com_skins += 1
            else:
                sem_skins.append(os.path.basename(path))
        except SystemExit:
            raise
        except Exception as e:
            print(f'   ! erro inesperado: {e}')
            sem_skins.append(os.path.basename(path))

        if i < len(arquivos):
            time.sleep(args.delay)

    print()
    print('═' * 60)
    print(f'  Heróis processados:  {len(arquivos)}')
    print(f'  Com skins:           {com_skins}')
    print(f'  Sem skins:           {len(sem_skins)}')
    print(f'  Total de skins:      {total_skins}')
    print('═' * 60)
    if sem_skins:
        print('\n  Sem skins:')
        for n in sem_skins[:20]:
            print(f'    • {n}')
        if len(sem_skins) > 20:
            print(f'    ... e mais {len(sem_skins) - 20}')


if __name__ == '__main__':
    main()