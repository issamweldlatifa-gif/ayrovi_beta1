#!/usr/bin/env python3
"""Preuve d'équivalence P3/T1 — la résolution des variables est identique avant/après.

Pour chaque feuille du back-office, on développe récursivement les `var(--x, …)` à partir des
définitions de l'ÉTAT CONSIDÉRÉ (HEAD pour l'avant, arbre de travail pour l'après : tokens.css +
définitions locales du fichier), puis on compare la valeur calculée de chaque déclaration, règle
par règle. Seule différence de structure admise : le bloc `:root` d'`admin.css`, dont les neuf
définitions `--admin-*` sont allées dans `tokens.css` et sont contrôlées séparément, mot pour mot.

Sortie : 0 écart + le nombre de déclarations comparées. Code de sortie 1 sinon.
"""
import re
import subprocess
import sys

FILES = ['client/src/admin/admin.css',
         'client/src/admin/back-office/back-office.css',
         'client/src/admin/interface-studio.css']
TOKENS = 'client/src/design/tokens.css'
MOVED = ['--admin-purple', '--admin-purple-dark', '--admin-yellow', '--admin-ink', '--admin-muted',
         '--admin-line', '--admin-bg', '--admin-card', '--admin-sidebar']


REV = sys.argv[sys.argv.index('--rev') + 1] if '--rev' in sys.argv else 'HEAD'


def read_git(rev, path):
    return subprocess.run(['git', 'show', f'{rev}:{path}'], capture_output=True, text=True, check=True).stdout


def strip_comments(text):
    out, i = [], 0
    while i < len(text):
        j = text.find('/*', i)
        if j == -1:
            out.append(text[i:])
            break
        out.append(text[i:j])
        k = text.find('*/', j + 2)
        i = len(text) if k == -1 else k + 2
    return ''.join(out)


def rules(text):
    """[(chemin_selecteur, propriété, valeur)] en suivant la profondeur d'accolades."""
    text = strip_comments(text)
    out, stack, buf, i = [], [], '', 0
    while i < len(text):
        c = text[i]
        if c == '{':
            stack.append(' @ '.join(x.strip() for x in stack + [buf] if x.strip()))
            buf = ''
        elif c == '}':
            sel = stack[-1] if stack else ''
            for decl in buf.split(';'):
                if ':' in decl:
                    prop, value = decl.split(':', 1)
                    out.append((sel, prop.strip(), value.strip()))
            buf = ''
            if stack:
                stack.pop()
        else:
            buf += c
        i += 1
    return out


VAR = re.compile(r'var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*))?\)')


def expand(value, table, depth=0):
    if depth > 14:
        return '\x00profondeur'
    prev = None
    while prev != value:
        prev = value
        value = VAR.sub(lambda m: expand(table[m.group(1)], table, depth + 1) if m.group(1) in table
                        else (expand(m.group(2), table, depth + 1) if m.group(2) is not None else '\x00INDEFINI'),
                        value)
    return re.sub(r'\s+', ' ', value).strip().lower()


HEX3 = re.compile(r'#([0-9a-fA-F]{3})(?![0-9a-fA-F])')
HEX4 = re.compile(r'#([0-9a-fA-F]{4})(?![0-9a-fA-F])')
SPACES = re.compile(r'rgba?\(\s*([0-9a-f.%]+)\s+([0-9a-f.%]+)\s+([0-9a-f.%]+)\s*/\s*([0-9a-f.%]+)\s*\)')


def canon(value, table):
    v = expand(value, table)
    # `#fff` et `#ffffff` sont la même couleur ; `rgb(1 2 3 / 4%)` et `rgb(1,2,3,4%)` aussi.
    v = HEX4.sub(lambda m: '#' + ''.join(c * 2 for c in m.group(1)), v)
    v = HEX3.sub(lambda m: '#' + ''.join(c * 2 for c in m.group(1)), v)
    v = SPACES.sub(lambda m: 'rgb(%s,%s,%s,%s)' % (m.group(1), m.group(2), m.group(3), m.group(4)), v)
    v = re.sub(r'#([0-9a-f]{6})ff$', r'#\1', v)   # alpha 100 % n'est pas un changement de rendu
    return v.replace(' ', '')


import os

BUNDLE = [TOKENS] + sorted(
    os.path.relpath(os.path.join(root, f), '.')
    for root, _dirs, files in os.walk('client/src')
    for f in files if f.endswith('.css')
)


def text_of(path, rev=None):
    return read_git(rev, path) if rev else open(path).read()


def table_for(rev=None):
    """Définitions de variables telles que la cascade admin les voit (dernier fichier gagnant)."""
    table = {}
    for path in BUNDLE:
        try:
            text = text_of(path, rev)
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
        for _sel, prop, value in rules(text):
            if prop.startswith('--'):
                table[prop] = value
    return table


def state(text, table):
    return {(sel, prop): canon(value, table) for sel, prop, value in rules(text)}, table


problems, checked = [], 0
tokens_new = open(TOKENS).read()
tokens_old = read_git(REV, TOKENS)
TABLE_OLD = table_for(REV)
TABLE_NEW = table_for()
moved_keys = set()
for path in FILES:
    old_map, _ = state(text_of(path, REV), TABLE_OLD)
    new_map, _ = state(text_of(path), TABLE_NEW)
    moved_keys |= {k for k in old_map if k[0] == ':root' and k[1] in MOVED}
    for key in old_map:
        if key in moved_keys:
            continue
        checked += 1
        if key not in new_map:
            problems.append(f'{path}: déclaration perdue  {key[0]} {{ {key[1]} }} = {old_map[key]!r}')
        elif new_map[key] != old_map[key]:
            problems.append(f'{path}: valeur différente  {key[0]} {{ {key[1]} }}\n'
                            f'     avant {old_map[key]!r}\n     après {new_map[key]!r}')
    for key in new_map:
        if key in moved_keys:
            continue
        if key not in old_map:
            problems.append(f'{path}: déclaration ajoutée  {key[0]} {{ {key[1]} }}')
        checked += 0

for name in MOVED:
    before = canon(TABLE_OLD.get(name, '\x00absent'), TABLE_OLD)
    after = canon(TABLE_NEW.get(name, '\x00absent-de-tokens'), TABLE_NEW)
    checked += 1
    if before != after:
        problems.append(f'token déplacé {name}: avant {before!r} après {after!r}')
    elif '\x00' in after:
        problems.append(f'token {name} absent de tokens.css après le sweep')

for name, value in TABLE_OLD.items():
    checked += 1
    if canon(TABLE_NEW.get(name, '\x00absent'), TABLE_NEW) != canon(value, TABLE_OLD):
        problems.append(f'token de la cascade modifié {name}: {canon(value, TABLE_OLD)!r} → '
                        f'{canon(TABLE_NEW.get(name, ""), TABLE_NEW)!r}')

print(f'propriétés publiques et admin conservées à la même valeur : {checked}')
if problems:
    print(f'{len(problems)} ÉCART(S) :')
    for p in problems[:30]:
        print(' -', p)
    sys.exit(1)
print('aucun écart : chaque déclaration résout exactement la valeur quelle résolvait avant.')
