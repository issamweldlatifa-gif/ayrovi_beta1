#!/usr/bin/env python3
"""Enveloppe un build Gradle pour que son échec SOIT LISIBLE de l'extérieur.

Pourquoi : le journal d'exécution GitHub n'est pas toujours consultable (et il ne
l'est pas depuis l'environnement d'où ce dépôt est piloté). Un « exit code 1 »
sans cause oblige à rejouer 20 minutes de build pour rien. Ici, l'échec est
publié en **annotation** : les 60 dernières lignes du journal Gradle, lisibles
depuis l'API et depuis la page du run.

Usage : gradle-diagnose.py <fichier-journal> [<titre>]
Sortie : une annotation `::error::` (échappée) + un court contexte systeme.
"""
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print('usage: gradle-diagnose.py <journal> [titre]', file=sys.stderr)
        return 2
    log_path = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else 'Build Gradle en échec'

    try:
        with open(log_path, 'r', encoding='utf-8', errors='replace') as handle:
            lines = handle.read().splitlines()
    except OSError as error:
        print(f'::error title={title}::journal illisible : {error}')
        return 0

    # Les lignes qui expliquent vraiment l'arrêt, d'abord ; le reste en appui.
    interesting = [
        line for line in lines
        if any(marker in line for marker in (
            'FAILURE', 'What went wrong', 'error:', 'Error:', 'Caused by', '> Task',
            'Could not', 'Execution failed', 'No space left', 'OutOfMemory',
        ))
    ]
    tail = (interesting[-40:] if interesting else []) + ['--- fin du journal ---'] + lines[-60:]
    message = '\n'.join(tail)[-3000:]

    # Échappement imposé par les annotations GitHub.
    message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error title={title}::{message}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
