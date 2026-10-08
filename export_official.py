#!/usr/bin/env python3
"""Exporta dados oficiais dos heróis MLBB (API usada por mobilelegends.com)
para static/data/official/<herói>.json, no formato descrito em OFICIAL-schema.md.

Somente biblioteca padrão do Python 3.8+.

═══════════════════════════════════════════════════════════════════════
AUTENTICAÇÃO
═══════════════════════════════════════════════════════════════════════
Defina o token MLBB_AUTH (header 'authorization' copiado do cURL do site):

  Linux/macOS:  export MLBB_AUTH='...'
  PowerShell:   $env:MLBB_AUTH = '...'
  Ou use:       --auth-file token.txt   (recomendado no Windows)

═══════════════════════════════════════════════════════════════════════
USO PRINCIPAL
═══════════════════════════════════════════════════════════════════════
  python export_official.py --out static/data/official --auth-file token.txt
  python export_official.py --out ... --only 9 --auth-file token.txt
  python export_official.py --out ... --catalog hero.json --auth-file token.txt

  # Após export, remover JSONs órfãos (heróis que saíram do jogo):
  python export_official.py --out ... --auth-file token.txt --clean-orphans

  # Limpar arquivos temporários de investigação (probe_*.json, p*.json, etc.):
  python export_official.py --clean-probes --clean-only
  python export_official.py --clean-probes --clean-only --dry-run  # só mostra

═══════════════════════════════════════════════════════════════════════
INVESTIGAR FONTES
═══════════════════════════════════════════════════════════════════════
  python export_official.py --scan 2756582 2756640 --lang pt_BR --auth-file token.txt
  python export_official.py --probe-hero 9 --auth-file token.txt
  python export_official.py --probe-hero 9 --source 2756564 --auth-file token.txt
  python export_official.py --probe 2756564 --body-file body.json --auth-file token.txt

═══════════════════════════════════════════════════════════════════════
FONTES CONHECIDAS
═══════════════════════════════════════════════════════════════════════
  2756567  stats por rank (win/pick/ban) + compat best/worst
  2756564  hero completo: media, lore, skills, counters, wallpapers

  Mortas (sempre 400): 2756560, 2756561, 2756562, 2756571+

═══════════════════════════════════════════════════════════════════════
NOTAS
═══════════════════════════════════════════════════════════════════════
  • Wallpaper tem cadeia de fallback: painting > head_big > squarebig
    > square > head. Heróis recém-lançados vêm com painting='' até a
    Moonton subir o asset — o fallback garante imagem sempre.
  • O campo hero.wallpaper_source indica de qual campo veio o wallpaper
    ('painting' = oficial, resto = fallback).
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = 'https://api.gms.moontontech.com/api/gms/source/2669606/'
ACT_ID, APP_ID = '2669607', '2669606'
SOURCE_NAME = 'Moonton (mobilelegends.com)'

SOURCE_STATS = 2756567   # win/pick/ban + compat
SOURCE_HERO  = 2756564   # tudo: media, lore, skills, counters, wallpaper


# ═══════════════════════════════════════════════════════════════════════
# REDE
# ═══════════════════════════════════════════════════════════════════════

def post(source_id, body, lang='en', auth=None, retries=3):
    auth = auth or os.environ.get('MLBB_AUTH', '')
    if not auth:
        sys.exit('Defina MLBB_AUTH (ou use --auth-file).')
    headers = {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        'authorization': auth,
        'origin': 'https://www.mobilelegends.com',
        'referer': 'https://www.mobilelegends.com/',
        'x-actid': ACT_ID,
        'x-appid': APP_ID,
        'x-lang': lang,
        'user-agent': 'Mozilla/5.0 (compatible; society-exporter/1.0)',
    }
    data = json.dumps(body).encode('utf-8')
    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(API + str(source_id), data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit('Erro %d: token expirou/recusado. Copie o cURL de novo.' % e.code)
            if e.code == 404:
                raise
            last_err = e
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(2 * attempt)
    raise RuntimeError('falha em %s após %d tentativas: %s' % (source_id, retries, last_err))


# ═══════════════════════════════════════════════════════════════════════
# UTILIDADES
# ═══════════════════════════════════════════════════════════════════════

def file_key(name):
    """'Akai' -> 'akai' | 'Yu Zhong' -> 'yu-zhong'."""
    s = ''.join(c for c in unicodedata.normalize('NFD', str(name))
                if unicodedata.category(c) != 'Mn').lower().strip()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def pct(v):
    return round(float(v) * 100, 2) if v is not None else None

def patch_from_image(url):
    """.../homepage_2_2_16_1232_1/... -> '2.2.16'."""
    m = re.search(r'homepage_(\d+)_(\d+)_(\d+)_', url or '')
    return '%s.%s.%s' % m.groups() if m else None

def date_from_ms(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime('%Y-%m-%d') if ms else None

def clean_html(s):
    """'<font color=x>(+5%)</font>' -> '(+5%)'."""
    if not s:
        return s
    return re.sub(r'<[^>]+>', '', s).strip()

def parse_cd_cost(s):
    """'CD: 11   Mana Cost: 50' -> (11.0, 50.0). Aceita só CD sem custo."""
    if not s:
        return None, None
    cd = re.search(r'CD:\s*([\d.]+)', s)
    cost = re.search(r'(?:Mana\s*Cost|Cost):\s*([\d.]+)', s)
    return (float(cd.group(1)) if cd else None,
            float(cost.group(1)) if cost else None)

def _clean_list(v):
    """Remove None/'' de uma lista. Usado pra tirar padding da API."""
    if not isinstance(v, list):
        return []
    return [x for x in v if x not in (None, '')]

def _label_list(items, field='road_sort_title'):
    """Extrai strings legíveis de arrays como roadsort/sortid."""
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if isinstance(it, str):
            if it:
                out.append(it)
        elif isinstance(it, dict):
            label = (it.get('data') or {}).get(field)
            if label:
                out.append(label)
    return out

def _hero_targets(section, names):
    """Extrai [{id, name, head}] de seções 'strong'/'weak'/'assist'."""
    if not isinstance(section, dict):
        return []
    ids    = section.get('target_hero_id') or []
    heroes = section.get('target_hero')    or []
    out = []
    for i, tid in enumerate(ids):
        if not tid:
            continue
        item = heroes[i] if i < len(heroes) else {}
        head = (item.get('data') or {}).get('head') if isinstance(item, dict) else None
        out.append({'id': tid, 'name': names.get(tid), 'head': head})
    return out

def _pick_wallpaper(hero, d):
    """
    Escolhe o melhor wallpaper disponível, com fallback.

    Ordem:
      painting (oficial) > head_big > squareheadbig > squarehead > head

    Retorna (url, source) — source = nome do campo de onde veio.
    Heróis recém-lançados vêm com painting='' até a Moonton subir o asset;
    o fallback garante que o JSON nunca fique sem imagem.
    """
    candidates = [
        (hero.get('painting'),       'painting'),
        (d.get('head_big'),          'head_big'),
        (hero.get('squareheadbig'),  'squarebig'),
        (hero.get('squarehead'),     'square'),
        (hero.get('head'),           'head'),
    ]
    for value, source in candidates:
        if value:
            return value, source
    return None, None


# ═══════════════════════════════════════════════════════════════════════
# BODY BUILDERS
# ═══════════════════════════════════════════════════════════════════════

def body_stats(hero_id, args):
    """Fonte 2756567 — filtro por main_heroid + bigrank + match_type."""
    return {
        'pageSize': 20, 'pageIndex': 1, 'sorts': [],
        'filters': [
            {'field': 'main_heroid', 'operator': 'eq', 'value': hero_id},
            {'field': 'bigrank',    'operator': 'eq', 'value': args.bigrank},
            {'field': 'match_type', 'operator': 'eq', 'value': args.match_type},
        ],
    }

def body_hero(hero_id, args):
    """Fonte 2756564 — filtro por hero_id, exige 'object': []."""
    return {
        'pageSize': 20, 'pageIndex': 1,
        'filters': [{'field': 'hero_id', 'operator': 'eq', 'value': hero_id}],
        'sorts': [], 'object': [],
    }


# ═══════════════════════════════════════════════════════════════════════
# RECORD HELPERS
# ═══════════════════════════════════════════════════════════════════════

def first_record(resp):
    recs = (resp.get('data') or {}).get('records') or []
    return recs[0] if recs else None

def load_body(args):
    if getattr(args, 'body_file', None):
        with open(args.body_file, encoding='utf-8-sig') as f:
            return json.load(f)
    if getattr(args, 'body', None):
        return json.loads(args.body)
    return None

def summarize_response(resp, max_keys=8):
    if not isinstance(resp, dict):
        return 'tipo=%s' % type(resp).__name__
    def ks(d):
        return list(d.keys())[:max_keys] if isinstance(d, dict) else None
    parts = ['top=%s' % (ks(resp) or [])]
    data = resp.get('data')
    if isinstance(data, dict):
        parts.append('data=%s' % (ks(data) or []))
        recs = data.get('records')
        if isinstance(recs, list):
            parts.append('n=%d' % len(recs))
            if recs and isinstance(recs[0], dict):
                parts.append('rec0=%s' % (ks(recs[0]) or []))
                rd = recs[0].get('data')
                if isinstance(rd, dict):
                    parts.append('rec0.data=%s' % (ks(rd) or []))
    elif isinstance(data, list):
        parts.append('data=[%d]' % len(data))
    return '  '.join(parts)


# ═══════════════════════════════════════════════════════════════════════
# CONVERSORES
# ═══════════════════════════════════════════════════════════════════════

def convert_stats(record, names):
    """Fonte 2756567 — stats por rank + compat best/worst."""
    d = record['data']
    hero = d['main_hero']['data']

    def pairs(items):
        out = []
        for it in sorted(items or [], key=lambda x: x.get('hero_index', 99)):
            name = names.get(it.get('heroid'))
            if name and it.get('increase_win_rate') is not None:
                out.append({'hero': name, 'value': round(it['increase_win_rate'] * 100, 1)})
        return out

    return {
        'name':   hero['name'],
        'patch':  patch_from_image(hero.get('head')),
        'stats': {
            'win':  pct(d.get('main_hero_win_rate')),
            'pick': pct(d.get('main_hero_appearance_rate')),
            'ban':  pct(d.get('main_hero_ban_rate')),
        },
        'compat': {
            'metric': 'pp',
            'best':   pairs(d.get('sub_hero')),
            'worst':  pairs(d.get('sub_hero_last')),
        },
        'updated': date_from_ms(record.get('_updatedAt')),
    }


def convert_hero(record, names):
    """Fonte 2756564 — hero completo (media, lore, skills, counters)."""
    d = record['data']
    hero = (d.get('hero') or {}).get('data') or {}
    rel  = d.get('relation') or {}

    raw_skills = (hero.get('heroskilllist') or [{}])[0].get('skilllist') or []
    skills = []
    for idx, s in enumerate(raw_skills):
        cd, cost = parse_cd_cost(s.get('skillcd&cost'))
        skills.append({
            'id':          s.get('skillid'),
            'name':        s.get('skillname'),
            'description': clean_html(s.get('skilldesc')),
            'icon':        s.get('skillicon'),
            'video':       s.get('skillvideo') or None,
            'cd':          cd,
            'cost':        cost,
            'is_passive':  idx == 0 and cd is None,
            'tags': [
                {'name': t.get('tagname'), 'rgb': t.get('tagrgb')}
                for t in (s.get('skilltag') or [])
            ],
        })

    wallpaper, wallpaper_src = _pick_wallpaper(hero, d)

    return {
        'name':      hero.get('name'),
        'hero_id':   hero.get('heroid'),
        'head':      hero.get('head'),
        'head_big':  d.get('head_big'),
        'square':    hero.get('squarehead'),
        'squarebig': hero.get('squareheadbig'),
        'smallmap':  hero.get('smallmap'),
        'wallpaper':        wallpaper,
        'wallpaper_source': wallpaper_src,

        'lore': {
            'short': hero.get('story') or None,
            'long':  hero.get('tale')  or None,
        },

        'meta': {
            'difficulty': hero.get('difficulty'),
            'speciality': _clean_list(hero.get('speciality')),
            'roadsort':   _clean_list(hero.get('roadsortlabel'))
                          or _label_list(hero.get('roadsort'), 'road_sort_title'),
            'sort':       _clean_list(hero.get('sortlabel'))
                          or _label_list(hero.get('sortid'), 'sort_title'),
            'recommend':  hero.get('recommendlevellabel'),
            'sorticon':   hero.get('sorticon1'),
            'roadicon':   hero.get('roadsorticon1'),
        },

        'skills': skills,

        'counters': {
            'assist': {
                'desc':   (rel.get('assist') or {}).get('desc'),
                'heroes': _hero_targets(rel.get('assist') or {}, names),
            },
            'strong': {
                'desc':   (rel.get('strong') or {}).get('desc'),
                'heroes': _hero_targets(rel.get('strong') or {}, names),
            },
            'weak': {
                'desc':   (rel.get('weak') or {}).get('desc'),
                'heroes': _hero_targets(rel.get('weak') or {}, names),
            },
        },

        'official_url': d.get('url'),
    }


SOURCES = [
    {'name': 'stats', 'id': SOURCE_STATS, 'build_body': body_stats, 'convert': convert_stats},
    {'name': 'hero',  'id': SOURCE_HERO,  'build_body': body_hero,  'convert': convert_hero},
]


# ═══════════════════════════════════════════════════════════════════════
# MERGE / ESCRITA
# ═══════════════════════════════════════════════════════════════════════

# Campos de hero que copiamos pra raiz do JSON (truthiness, não "is not None",
# pra ignorar strings vazias). Inclui wallpaper_source pra rastreabilidade.
HERO_FIELDS = (
    'name', 'head', 'head_big', 'square', 'squarebig',
    'smallmap', 'wallpaper', 'wallpaper_source', 'hero_id',
)


def merge_and_write(out_dir, name, sections):
    """sections = {'stats': {...}, 'hero': {...}} — mescla tudo no JSON."""
    path = os.path.join(out_dir, file_key(name) + '.json')
    current = {}
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                current = json.load(f)
        except (OSError, ValueError):
            current = {}
    current.pop('sample', None)
    current.update({'v': 1, 'source': SOURCE_NAME})

    if 'stats' in sections:
        st = sections['stats']
        if st.get('patch'):   current['patch']   = st['patch']
        if st.get('updated'): current['updated'] = st['updated']
        current['stats']  = {**current.get('stats', {}), **st.get('stats', {})}
        if 'compat' in st:    current['compat']  = st['compat']

    if 'hero' in sections:
        h = sections['hero']
        current.setdefault('hero', {})
        for k in HERO_FIELDS:
            if h.get(k):                   # truthiness: ignora '', None, 0
                current['hero'][k] = h[k]
        if h.get('lore'):         current['lore']         = h['lore']
        if h.get('meta'):         current['meta']         = h['meta']
        if h.get('skills'):       current['skills']       = h['skills']
        if h.get('counters'):     current['counters']     = h['counters']
        if h.get('official_url'): current['official_url'] = h['official_url']

    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(current, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)
    return path


# ═══════════════════════════════════════════════════════════════════════
# LIMPEZA — arquivos órfãos e temporários
# ═══════════════════════════════════════════════════════════════════════

def clean_orphans(out_dir, keep_names, dry_run=False):
    """
    Remove arquivos .json em out_dir que NÃO correspondem aos heróis
    passados em keep_names. Use após um export completo (não --only!).
    """
    if not keep_names:
        return []
    keep = {file_key(n) + '.json' for n in keep_names}
    removed = []
    if not os.path.isdir(out_dir):
        return removed
    for fname in sorted(os.listdir(out_dir)):
        if not fname.endswith('.json'):
            continue
        if fname in keep:
            continue
        path = os.path.join(out_dir, fname)
        if dry_run:
            removed.append(fname)
        else:
            try:
                os.remove(path)
                removed.append(fname)
            except OSError as e:
                print('  ! não removi %s: %s' % (fname, e))
    return removed


# Regexes dos arquivos temporários que criamos durante a investigação.
# Só removemos o que casa EXATAMENTE aqui — nada além.
PROBE_REGEXES = [
    re.compile(r'^probe_.*\.json$'),          # probe_skills_all.json, probe_ptbr.json...
    re.compile(r'^p\d{2,}\.json$'),           # p60.json, p61.json, p64.json
    re.compile(r'^m\d{2,}\.json$'),           # m63.json, m64.json
    re.compile(r'^s\d{2,}\.json$'),           # s75.json
    re.compile(r'^t\d+\.json$'),              # t1.json, t2.json, t3.json
    re.compile(r'^body_.*\.json$'),           # body_heroid.json, body_hero_id.json
    re.compile(r'^body[A-Z].*\.json$'),       # bodyA.json, bodyB.json, bodyC.json
    re.compile(r'^scan_body\.json$'),         # scan_body.json
    re.compile(r'^page\d*\.json$'),           # page2.json
    re.compile(r'^check\.json$'),             # check.json
]

def clean_probes(directory, dry_run=False):
    """
    Remove arquivos temporários de investigação do diretório.
    Só toca em .json que casam com PROBE_REGEXES. Não mexe em check.py,
    token.txt, ou nos JSONs de saída.
    """
    removed = []
    if not os.path.isdir(directory):
        return removed
    for fname in sorted(os.listdir(directory)):
        if not fname.endswith('.json'):
            continue
        if not any(rx.match(fname) for rx in PROBE_REGEXES):
            continue
        path = os.path.join(directory, fname)
        if dry_run:
            removed.append(fname)
        else:
            try:
                os.remove(path)
                removed.append(fname)
            except OSError as e:
                print('  ! não removi %s: %s' % (fname, e))
    return removed


def _report_cleanup(titulo, removed, dry_run):
    if not removed:
        print('  (%s) nada para remover.' % titulo)
        return
    verb = 'seriam removidos' if dry_run else 'removidos'
    print('  (%s) %d arquivo(s) %s:' % (titulo, len(removed), verb))
    for f in removed:
        print('     • %s' % f)


# ═══════════════════════════════════════════════════════════════════════
# EXPORT
# ═══════════════════════════════════════════════════════════════════════

def export(args):
    os.makedirs(args.out, exist_ok=True)
    ids = [args.only] if args.only else range(1, args.max_id + 1)

    # Passa 1: stats (também monta o mapa id→nome)
    stats_records = {}
    print('── Passa 1/2 — stats ──')
    for hid in ids:
        try:
            rec = first_record(post(SOURCE_STATS, body_stats(hid, args), lang=args.lang))
        except SystemExit:
            raise
        except Exception as e:
            print('  ! herói %s: %s' % (hid, e), file=sys.stderr)
            continue
        if rec:
            stats_records[hid] = rec
            print('  ok herói %s: %s' % (hid, rec['data']['main_hero']['data']['name']))
        time.sleep(args.delay)

    names = {int(r['data']['main_heroid']): r['data']['main_hero']['data']['name']
             for r in stats_records.values()}

    # Passa 2: hero (media + lore + skills + counters)
    hero_records = {}
    print('\n── Passa 2/2 — hero (media/skills/counters) ──')
    for hid in stats_records.keys():
        try:
            rec = first_record(post(SOURCE_HERO, body_hero(hid, args), lang=args.lang))
        except SystemExit:
            raise
        except Exception as e:
            print('  ! herói %s: %s' % (hid, e), file=sys.stderr)
            continue
        if rec:
            hero_records[hid] = rec
            print('  ok herói %s' % hid)
        time.sleep(args.delay)

    # Merge e grava
    print('\n── Gravando arquivos ──')
    written, skipped, names_ok = [], [], []
    for hid, srec in stats_records.items():
        try:
            sections = {'stats': convert_stats(srec, names)}
            if hid in hero_records:
                sections['hero'] = convert_hero(hero_records[hid], names)
            name = sections['stats']['name']
            written.append((name, merge_and_write(args.out, name, sections)))
            names_ok.append(name)
        except Exception as e:
            skipped.append((hid, str(e)))

    print('\nArquivos gravados: %d | com erro: %d' % (len(written), len(skipped)))
    for n, e in skipped:
        print('  ! %s: %s' % (n, e), file=sys.stderr)

    if args.catalog:
        with open(args.catalog, encoding='utf-8-sig') as f:
            cat = {file_key(h['name_hero']) for h in json.load(f)}
        missing = sorted(n for n, _ in written if file_key(n) not in cat)
        print('Fora do catálogo (%d): %s' % (len(missing), ', '.join(missing) or '-'))

    # ─── Limpeza pós-export ───
    if args.clean_orphans:
        print('\n── Limpando JSONs órfãos em %s ──' % args.out)
        if args.only:
            print('  ⚠️  ignorado: --clean-orphans com --only apagaria todos os outros heróis.')
        else:
            removed = clean_orphans(args.out, names_ok, dry_run=args.dry_run)
            _report_cleanup('orphans', removed, args.dry_run)

    if args.clean_probes:
        print('\n── Limpando arquivos temporários em %s ──' % os.getcwd())
        removed = clean_probes(os.getcwd(), dry_run=args.dry_run)
        _report_cleanup('probes', removed, args.dry_run)


# ═══════════════════════════════════════════════════════════════════════
# PROBES
# ═══════════════════════════════════════════════════════════════════════

def _emit(text, save):
    if save:
        with open(save, 'w', encoding='utf-8') as f:
            f.write(text)
        print('Resposta salva em', save)
    else:
        print(text)


def probe(args):
    body = load_body(args) or {'pageSize': 20, 'pageIndex': 1, 'filters': [], 'sorts': []}
    resp = post(args.probe, body, lang=args.lang)
    _emit(json.dumps(resp, ensure_ascii=False, indent=2), args.save)


def probe_hero(args):
    """Consulta a fonte escolhida para 1 herói, com o body certo."""
    if args.source == SOURCE_STATS:
        body = body_stats(args.probe_hero, args)
    else:
        body = body_hero(args.probe_hero, args)
    print('Fonte %d | body: %s' % (args.source, json.dumps(body)))
    resp = post(args.source, body, lang=args.lang)
    _emit(json.dumps(resp, ensure_ascii=False, indent=2), args.save)


def scan_sources(args):
    start, end = args.scan
    if end < start:
        start, end = end, start
    if end - start > 200:
        sys.exit('--scan: intervalo máximo de 200 fontes.')
    body = load_body(args) or {'pageSize': 20, 'pageIndex': 1, 'filters': [], 'sorts': []}
    print('Varrendo %d fontes...\n' % (end - start + 1))
    for sid in range(start, end + 1):
        try:
            resp = post(sid, body, lang=args.lang)
        except SystemExit:
            raise
        except urllib.error.HTTPError as e:
            print('[%d] HTTP %d' % (sid, e.code))
            continue
        except Exception as e:
            print('[%d] erro  %s' % (sid, e))
            continue
        print('[%d] ok    %s' % (sid, summarize_response(resp)))
        time.sleep(args.delay)


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)

    # Export
    p.add_argument('--out', default='static/data/official')
    p.add_argument('--only', type=int)
    p.add_argument('--max-id', type=int, default=160)
    p.add_argument('--bigrank', type=int, default=101)
    p.add_argument('--match-type', type=int, default=1)
    p.add_argument('--lang', default='en')
    p.add_argument('--delay', type=float, default=0.7)
    p.add_argument('--catalog')

    # Auth
    p.add_argument('--auth-file')

    # Probes
    p.add_argument('--probe')
    p.add_argument('--probe-hero', type=int, metavar='ID')
    p.add_argument('--source', type=int, default=SOURCE_HERO)
    p.add_argument('--body')
    p.add_argument('--body-file')
    p.add_argument('--save')
    p.add_argument('--scan', nargs=2, type=int, metavar=('INICIO', 'FIM'))

    # Limpeza
    p.add_argument('--clean-orphans', action='store_true',
                   help='após export, remove .json de heróis que saíram do jogo')
    p.add_argument('--clean-probes', action='store_true',
                   help='remove arquivos temporários de investigação (probe_*.json, p*.json, etc.)')
    p.add_argument('--clean-only', action='store_true',
                   help='com --clean-probes: só limpa, não exporta')
    p.add_argument('--dry-run', action='store_true',
                   help='com --clean-*: só mostra o que seria removido, sem apagar')

    args = p.parse_args()

    # Carrega token de arquivo (prioridade sobre env var)
    if args.auth_file:
        try:
            with open(args.auth_file, encoding='utf-8') as f:
                os.environ['MLBB_AUTH'] = f.read().strip()
        except OSError as e:
            sys.exit('Não consegui ler --auth-file: %s' % e)

    # Modo --clean-only: só limpa, não exporta
    if args.clean_only:
        if args.clean_orphans:
            sys.exit('--clean-only + --clean-orphans não faz sentido '
                     '(sem export, não temos a lista de heróis para preservar).')
        if not args.clean_probes:
            sys.exit('--clean-only precisa de --clean-probes.')
        print('── Limpando arquivos temporários em %s ──' % os.getcwd())
        removed = clean_probes(os.getcwd(), dry_run=args.dry_run)
        _report_cleanup('probes', removed, args.dry_run)
        return

    if args.scan:          scan_sources(args)
    elif args.probe_hero:  probe_hero(args)
    elif args.probe:       probe(args)
    else:                  export(args)


if __name__ == '__main__':
    main()