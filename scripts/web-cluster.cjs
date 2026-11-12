#!/usr/bin/env node
/**
 * AYROVI — plusieurs processus web sur UNE machine, partageant la même base SQLite
 * (audit d'architecture 12/11/2026, §6.1 de docs/AYROVI_ARCHITECTURE_SCALABLE_AR_2026-11-12.md).
 *
 *   AYROVI_WEB_CONCURRENCY=2 node scripts/web-cluster.cjs      (après `npm run build:server`)
 *
 * Pourquoi : un processus Node n'exécute le JavaScript que sur UN cœur. Passer
 * à une machine 2 ou 4 vCPU sans ce lanceur ne double pas la capacité. Tant que
 * la base est SQLite sur un disque attaché (Render : une seule instance par
 * service avec disque), c'est la seule façon d'utiliser plusieurs cœurs.
 * SQLite en WAL supporte plusieurs processus SUR LE MÊME HÔTE (verrous de
 * fichier ; busy_timeout=5000 déjà réglé dans src/db/database.ts).
 *
 * Règles :
 *  • le processus n°1 démarre SEUL (migrations, installation des compteurs),
 *    garde les tâches planifiées (AYROVI_BACKGROUND_JOBS hérité) ; les suivants
 *    démarrent ensuite avec AYROVI_BACKGROUND_JOBS=off (pas de double envoi de
 *    push / e-mails / sauvegardes) ;
 *  • chaque processus reçoit sa PART de CPU et de mémoire (AYROVI_CPU_LIMIT,
 *    AYROVI_MEMORY_LIMIT_MB) pour que la grille de signaux reste juste ;
 *  • un processus qui tombe est relancé avec le même rôle ;
 *  • SIGTERM est relayé : chaque processus termine proprement ses requêtes.
 *
 * Limites connues (à lire avant la production) : l'état en mémoire est PAR
 * processus — limiteurs de débit (plafond effectif × N), tentatives de
 * connexion, caches. Le panneau « Capacité du serveur » montre le processus
 * qui a servi la requête (l'historique horaire, lui, est tenu par processus).
 */
const cluster = require('node:cluster');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function cgroupCpus() {
  try {
    const [quota, period] = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    if (quota !== 'max' && Number(period) > 0) return Number(quota) / Number(period);
  } catch { /* cgroup v1 ou absent */ }
  return null;
}
function cgroupMemoryMb() {
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (raw !== 'max') return Math.floor(Number(raw) / (1024 * 1024));
  } catch { /* cgroup v1 ou absent */ }
  return null;
}

if (cluster.isPrimary) {
  const cpus = Number(process.env.AYROVI_CPU_LIMIT) || cgroupCpus() || os.availableParallelism();
  const memoryMb = Number(process.env.AYROVI_MEMORY_LIMIT_MB) || cgroupMemoryMb() || Math.floor(os.totalmem() / (1024 * 1024));
  const workers = Math.max(1, Math.min(16, Number(process.env.AYROVI_WEB_CONCURRENCY) || Math.max(1, Math.floor(cpus))));
  const share = {
    AYROVI_CPU_LIMIT: String(+(cpus / workers).toFixed(2)),
    AYROVI_MEMORY_LIMIT_MB: String(Math.floor(memoryMb / workers)),
  };
  let stopping = false;
  const roles = new Map(); // worker.id → numéro logique (1 = tâches planifiées)
  const fork = (slot) => {
    const env = { ...share, AYROVI_WORKER_ID: String(slot) };
    if (slot > 1) env.AYROVI_BACKGROUND_JOBS = 'off';
    const worker = cluster.fork(env);
    roles.set(worker.id, slot);
    return worker;
  };
  console.log(`[web-cluster] ${workers} processus · ${cpus} vCPU · ${memoryMb} Mo (part : ${share.AYROVI_CPU_LIMIT} vCPU / ${share.AYROVI_MEMORY_LIMIT_MB} Mo)`);
  const first = fork(1);
  first.once('listening', () => { for (let slot = 2; slot <= workers; slot++) fork(slot); });
  const restarts = new Map();
  cluster.on('exit', (worker, code, signal) => {
    const slot = roles.get(worker.id); roles.delete(worker.id);
    if (stopping) { if (!Object.keys(cluster.workers || {}).length) process.exit(0); return; }
    const recent = (restarts.get(slot) || []).filter((t) => Date.now() - t < 60_000);
    restarts.set(slot, [...recent, Date.now()]);
    const delay = Math.min(30_000, 1000 * 2 ** recent.length);
    console.error(`[web-cluster] processus n°${slot} arrêté (${signal || code}) — relance dans ${delay} ms`);
    setTimeout(() => fork(slot), delay);
  });
  const stop = (signal) => {
    if (stopping) return; stopping = true;
    console.log(`[web-cluster] ${signal} — arrêt propre des processus`);
    for (const worker of Object.values(cluster.workers || {})) worker?.process.kill('SIGTERM');
    setTimeout(() => process.exit(0), 30_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
} else {
  require(path.join(__dirname, '..', 'dist', 'server.js'));
}
