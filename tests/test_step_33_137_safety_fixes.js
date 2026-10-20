/**
 * STEP 33.137 — Offline synthetic regression tests for the two application safety fixes.
 *
 *   Fix A: physical receipt reservations (res_phys_*) in downloadBackup()/restoreBackup()
 *   Fix B: commissioning guard in fsCreateIndependentReceipt()
 *
 * SAFETY: This harness never loads the Firebase SDK and never opens a network connection.
 * The real application functions are extracted verbatim from the HTML file and executed in
 * an isolated Node `vm` context against an in-memory mock Firestore populated with
 * synthetic fixtures only.
 *
 * Usage:
 *   node tests/test_step_33_137_safety_fixes.js [path/to/Temple_Accounts-1.html] [--json out.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && (jsonIdx < 0 || i !== jsonIdx + 1));
const TARGET = path.resolve(positional[0] || path.join(__dirname, '..', 'Temple_Accounts-1.html'));
const HTML = fs.readFileSync(TARGET, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Function extraction (brace matcher aware of strings, templates, comments, regex)
// ─────────────────────────────────────────────────────────────────────────────
function findBlockEnd(src, openIdx) {
  let i = openIdx;
  const stack = ['{'];          // '{' code brace, '${' template expr, '`' template
  i++;
  let lastSig = '{';
  while (i < src.length && stack.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    if (top === '`') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; lastSig = ')'; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push('${'); i += 2; lastSig = '{'; continue; }
      i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; lastSig = ')'; continue;
    }
    if (c === '`') { stack.push('`'); i++; continue; }
    if (c === '/' && /[(,=:\[!&|?{};+\-*%<>~^]|^$/.test(lastSig)) {
      // regex literal
      i++;
      let inClass = false;
      while (i < src.length) {
        const r = src[i];
        if (r === '\\') { i += 2; continue; }
        if (r === '[') inClass = true; else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i])) i++;
      lastSig = ')'; continue;
    }
    if (c === '{') { stack.push('{'); }
    else if (c === '}') { stack.pop(); }
    if (!/\s/.test(c)) lastSig = /[A-Za-z0-9_$]/.test(c) ? 'w' : c;
    if (lastSig === 'w') {
      // keywords after which a '/' starts a regex
      const m = /([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(src.slice(Math.max(0, i - 12), i + 1));
      if (m && ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw'].includes(m[1])) lastSig = '(';
    }
    i++;
  }
  return i; // index just after closing brace
}

function extractFunction(name) {
  const re = new RegExp(`(?:^|\\n)([ \\t]*)((?:async\\s+)?function\\s+${name.replace(/\$/g, '\\$')}\\s*\\()`);
  const m = re.exec(HTML);
  if (!m) throw new Error(`Function ${name} not found in ${TARGET}`);
  const start = m.index + m[0].indexOf(m[2]);
  // locate the body brace after the parameter list
  let depth = 0, j = start + m[2].length - 1;
  for (; j < HTML.length; j++) {
    if (HTML[j] === '(') depth++;
    else if (HTML[j] === ')') { depth--; if (depth === 0) break; }
  }
  const open = HTML.indexOf('{', j);
  const end = findBlockEnd(HTML, open);
  const src = HTML.slice(start, end);
  new vm.Script(src); // compile check: throws if boundaries are wrong
  return src;
}

const FUNCS = [
  'formatGlobalNumber', 'parseGlobalNumber', 'parsePhysicalReceiptIdentifier',
  '_serializeTimestamp', '_serializeDoc', '_canonicalJsonStringify', '_computeSha256', '_getBackupIntegrityPayload',
  'downloadBackup', 'restoreBackup',
  'getFsCountersDocRef', 'generateOperationId',
  'computeBillingFingerprintV1', 'computeBillingFingerprint', 'computeReceiptFingerprintV1', 'computeReceiptFingerprint',
  'getBillingRecordISODate', 'todayISO',
  'fsCreateBillingWithAccounting', 'fsCreatePhysicalReceipt', 'fsCreateIndependentReceipt'
];
const extracted = FUNCS.map(extractFunction).join('\n\n');

// ─────────────────────────────────────────────────────────────────────────────
// 2. In-memory mock Firestore (synthetic only)
// ─────────────────────────────────────────────────────────────────────────────
const clone = v => (v === undefined ? undefined : structuredClone(v));
class MockDb {
  constructor() { this.store = new Map(); this.writes = []; }
  _key(col, id) { return `${col}/${id}`; }
  collection(col) { return new MockCol(this, col); }
  _snap(col, id) {
    const k = this._key(col, id);
    const has = this.store.has(k);
    const data = has ? clone(this.store.get(k)) : undefined;
    return { id, exists: has, data: () => clone(data) };
  }
  _apply(op) {
    const k = this._key(op.col, op.id);
    this.writes.push({ type: op.type, path: k });
    if (op.type === 'delete') { this.store.delete(k); return; }
    if (op.merge && this.store.has(k)) this.store.set(k, { ...this.store.get(k), ...clone(op.data) });
    else this.store.set(k, clone(op.data));
  }
  batch() {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push({ type: 'set', col: ref._col, id: ref.id, data, merge: !!(opts && opts.merge) }),
      delete: ref => ops.push({ type: 'delete', col: ref._col, id: ref.id }),
      commit: async () => { ops.forEach(o => this._apply(o)); }
    };
  }
  async runTransaction(fn) {
    const ops = [];
    const tx = {
      get: async ref => this._snap(ref._col, ref.id),
      set: (ref, data, opts) => { ops.push({ type: 'set', col: ref._col, id: ref.id, data, merge: !!(opts && opts.merge) }); return tx; },
      update: (ref, data) => { ops.push({ type: 'set', col: ref._col, id: ref.id, data, merge: true }); return tx; },
      delete: ref => { ops.push({ type: 'delete', col: ref._col, id: ref.id }); return tx; }
    };
    const result = await fn(tx);          // throw => nothing applied (atomic)
    ops.forEach(o => this._apply(o));
    return result;
  }
  get(col, id) { return clone(this.store.get(this._key(col, id))); }
  put(col, id, data) { this.store.set(this._key(col, id), clone(data)); }
  ids(col) { return [...this.store.keys()].filter(k => k.startsWith(col + '/')).map(k => k.slice(col.length + 1)).sort(); }
}
class MockCol {
  constructor(db, col) { this.db = db; this.col = col; }
  doc(id) { return new MockDoc(this.db, this.col, id); }
  async get() {
    const docs = this.db.ids(this.col).map(id => this.db._snap(this.col, id));
    return { size: docs.length, docs, forEach: f => docs.forEach(f), empty: docs.length === 0 };
  }
}
class MockDoc {
  constructor(db, col, id) { this.db = db; this._col = col; this.id = id; }
  async get() { return this.db._snap(this._col, this.id); }
  async set(data, opts) { this.db._apply({ type: 'set', col: this._col, id: this.id, data, merge: !!(opts && opts.merge) }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sandbox
// ─────────────────────────────────────────────────────────────────────────────
const USER = { uid: 'synthetic-uid-001', email: 'synthetic@test.invalid', displayName: 'Synthetic Tester' };
function makeEnv() {
  const db = new MockDb();
  const env = { db, alerts: [], downloads: [], restoreFileText: null, consoleLog: [] };
  const fakeEl = () => ({ style: {}, appendChild() { }, click() { }, set innerHTML(v) { }, scrollTop: 0, scrollHeight: 0, textContent: '' });
  const sandbox = {
    console: { log: (...a) => env.consoleLog.push(a.join(' ')), warn: (...a) => env.consoleLog.push('WARN ' + a.join(' ')), error: (...a) => env.consoleLog.push('ERROR ' + a.join(' ')) },
    crypto: globalThis.crypto, TextEncoder, structuredClone, Date, Math, JSON, Promise, Map, Set, Number, String, Object, Array, Error, RegExp, parseInt, parseFloat, isNaN, isFinite,
    require,
    Blob,
    URL: { createObjectURL: blob => { env.downloads.push(blob); return 'blob:synthetic'; }, revokeObjectURL() { } },
    setTimeout: () => 0,
    alert: msg => env.alerts.push(String(msg)),
    confirm: () => true,
    document: {
      getElementById: id => (id === 'restoreFile'
        ? { files: [{ text: async () => env.restoreFileText }] }
        : null),
      createElement: () => fakeEl(),
      body: { appendChild() { }, removeChild() { } }
    },
    FS_COUNTERS_COLLECTION: 'system',
    FS_COUNTERS_DOC_ID: 'counters',
    getFirestoreDb: () => db,
    getCurrentFirebaseUser: () => USER,
    el: id => sandbox.document.getElementById(id),
    fsGetAllSafe: async () => [],
    refreshSettings: async () => { },
    navigate: async () => { },
    allFunds: async () => db.ids('funds').map(id => ({ ...db.get('funds', id), firestoreId: id }))
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(extracted, sandbox, { filename: 'extracted_from_' + path.basename(TARGET) });
  env.sb = sandbox;
  return env;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Synthetic fixtures
// ─────────────────────────────────────────────────────────────────────────────
const TS = 1760850000000;
function seedMaster(db) {
  db.put('settings', 'app', { templeName: 'Synthetic Temple', createdAt: TS });
  db.put('funds', 'fund_1', { id: 1, name: 'General Temple Fund' });
  db.put('funds', 'fund_2', { id: 2, name: 'Punarudharanam Fund' });
  db.put('funds', 'fund_3', { id: 3, name: 'Chitty Fund' });
  db.put('incomeCategories', 'inc_1', { id: 1, name: 'Pooja Income' });
  db.put('incomeCategories', 'inc_2', { id: 2, name: 'Donation Income' });
  db.put('expenseCategories', 'exp_1', { id: 1, name: 'Electricity' });
  db.put('expenseCategories', 'exp_2', { id: 2, name: 'Salary' });
  db.put('bankAccounts', 'bank_1', { id: 1, name: 'Synthetic Bank' });
}
function seedCounters(db, gsc) {
  db.put('system', 'counters', { globalSequenceCounter: gsc, billingReceiptCounter: gsc, receiptCounter: 1000, voucherCounter: 500 });
}
function billingInput(extra = {}) {
  return { fund: 'General Temple Fund', category: 'Pooja', item: 'Archana', quantity: 1, unitPrice: 50, totalAmount: 50,
    paymentMode: 'Cash', devoteeName: 'Synthetic Devotee', star: 'Aswathi', date: '2026-10-19', time: '10:00', incomeCategory: 'Pooja Income', ...extra };
}
function receiptInput(extra = {}) {
  return { date: '2026-10-19', name: 'Synthetic Donor', fund: 'General Temple Fund', category: 'Donation Income',
    amount: 100, paymentMode: 'Cash', ...extra };
}
function physInput(no, extra = {}) {
  return { manualReceiptNo: no, date: '2026-10-19', name: 'Synthetic Physical', amount: 75, paymentMode: 'Cash', ...extra };
}

/** Build a populated synthetic DB through the REAL creation functions. */
async function buildPopulated(env) {
  const { db, sb } = env;
  seedMaster(db);
  seedCounters(db, 0);
  const b1 = await sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_syn1' }));
  const b2 = await sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_syn2', devoteeName: 'Second' }));
  const r3 = await sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_syn3' }));
  const p1 = await sb.fsCreatePhysicalReceipt(physInput('P600', { operationId: 'op_phys_rcpt_syn600' }));
  const p2 = await sb.fsCreatePhysicalReceipt(physInput('PU1', { operationId: 'op_phys_rcpt_synpu1' }));
  return { b1, b2, r3, p1, p2 };
}

async function runDownload(env) {
  env.downloads.length = 0;
  await env.sb.downloadBackup();
  if (env.alerts.length) throw new Error('downloadBackup alerted: ' + env.alerts.join(' | '));
  if (!env.downloads.length) throw new Error('downloadBackup produced no file');
  return JSON.parse(await env.downloads[env.downloads.length - 1].text());
}
async function resign(obj) {
  const canon = vmCall('_canonicalJsonStringify', obj);
  const hash = nodeCrypto.createHash('sha256').update(canon, 'utf8').digest('hex').toUpperCase();
  obj.metadata.integrity = { algorithm: 'SHA-256', canonicalization: 'RFC8785-subset', hash, coveredSections: ['collections', 'counters', 'reservations', 'idempotency', 'system'] };
  obj.metadata.sha256 = hash;
  return obj;
}
let _helperEnv = null;
function vmCall(fn, obj) {
  if (!_helperEnv) _helperEnv = makeEnv();
  return _helperEnv.sb[fn](_helperEnv.sb._getBackupIntegrityPayload(obj));
}
async function runRestore(env, backupObj) {
  env.alerts.length = 0;
  env.consoleLog.length = 0;
  env.restoreFileText = JSON.stringify(backupObj);
  await env.sb.restoreBackup();
  const failed = env.alerts.some(a => a.startsWith('Restore failed'));
  return { failed, alerts: env.alerts.slice(), log: env.consoleLog.slice() };
}
function freshTargetEnv() { const e = makeEnv(); return e; }
const stripRestore = d => { if (!d) return d; const { _restoredAt, _restoredBy, ...rest } = d; return rest; };

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tests
// ─────────────────────────────────────────────────────────────────────────────
const results = [];
async function test(id, name, fn) {
  try { const detail = await fn(); results.push({ id, name, pass: true, detail: detail || '' }); console.log(`  PASS  ${id} ${name}`); }
  catch (e) { results.push({ id, name, pass: false, detail: e.message }); console.log(`  FAIL  ${id} ${name}\n        → ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

(async () => {
  console.log(`STEP 33.137 synthetic tests — target: ${TARGET}`);
  console.log(`Extracted ${FUNCS.length} functions (${extracted.length} chars). Mock Firestore only; no network.\n`);

  // Shared populated source + exported backup
  const src = makeEnv();
  const created = await buildPopulated(src);
  const backup = await runDownload(src);

  // ── Fix A ───────────────────────────────────────────────────────────────
  console.log('Fix A — physical receipt backup/restore');

  await test('A1', 'Numeric and physical reservations round-trip together', async () => {
    const resIds = backup.reservations.map(r => r._firestoreId).sort();
    eq(resIds, ['res_1', 'res_2', 'res_3', 'res_phys_P600', 'res_phys_PU1'], 'backup reservation IDs');
    const dst = freshTargetEnv();
    const r = await runRestore(dst, backup);
    assert(!r.failed, 'restore failed: ' + r.alerts.join(' | '));
    for (const id of resIds) {
      eq(stripRestore(dst.db.get('system', id)), stripRestore(src.db.get('system', id)), `system/${id} content`);
    }
    for (const col of ['billing', 'receipts']) eq(dst.db.ids(col), src.db.ids(col), `${col} ids`);
    return `restored ${resIds.join(', ')}`;
  });

  await test('A2', 'Physical reservations with seqNumber null do not alter the global counter', async () => {
    eq(src.db.get('system', 'res_phys_P600').seqNumber, null, 'physical seqNumber');
    eq(src.db.get('system', 'counters').globalSequenceCounter, 3, 'source gsc after 2 bills + 1 receipt + 2 physical');
    // Backup with only physical reservations + gsc 0 must restore and keep gsc at 0.
    const physOnly = makeEnv();
    seedMaster(physOnly.db); seedCounters(physOnly.db, 0);
    await physOnly.sb.fsCreatePhysicalReceipt(physInput('P601', { operationId: 'op_phys_rcpt_only601' }));
    eq(physOnly.db.get('system', 'counters').globalSequenceCounter, 0, 'gsc unchanged by physical creation');
    const b = await runDownload(physOnly);
    const dst = freshTargetEnv();
    const r = await runRestore(dst, b);
    assert(!r.failed, 'restore failed: ' + r.alerts.join(' | '));
    eq(dst.db.get('system', 'counters').globalSequenceCounter, 0, 'restored gsc');
    assert(dst.db.get('system', 'res_phys_P601'), 'res_phys_P601 restored');
    // Full backup: gsc stays at max numeric seq (3)
    const dst2 = freshTargetEnv();
    const r2 = await runRestore(dst2, backup);
    assert(!r2.failed, 'full restore failed');
    eq(dst2.db.get('system', 'counters').globalSequenceCounter, 3, 'full restore gsc');
    return 'gsc 0 preserved with physical-only backup; gsc 3 with mixed backup';
  });

  await test('A2b', 'Older backup: physical reservation without _firestoreId is restored via physicalId', async () => {
    const legacy = structuredClone(backup);
    for (const list of [legacy.reservations, legacy.system.reservations]) {
      const p = list.find(r => r._firestoreId === 'res_phys_P600');
      delete p._firestoreId;
    }
    await resign(legacy);
    const dst = freshTargetEnv();
    const r = await runRestore(dst, legacy);
    assert(!r.failed, 'restore failed: ' + r.alerts.join(' | '));
    assert(dst.db.get('system', 'res_phys_P600'), 'res_phys_P600 derived from physicalId');
    eq(stripRestore(dst.db.get('system', 'res_phys_P600')), stripRestore(src.db.get('system', 'res_phys_P600')), 'content');
    return 'docId derived as res_phys_P600';
  });

  await test('A3', 'Existing numeric-only backups remain compatible', async () => {
    const num = makeEnv();
    seedMaster(num.db); seedCounters(num.db, 0);
    await num.sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_n1' }));
    await num.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_n2' }));
    const b = await runDownload(num);
    eq(b.reservations.map(r => r._firestoreId), ['res_1', 'res_2'], 'numeric reservations');
    const dst = freshTargetEnv();
    const r = await runRestore(dst, b);
    assert(!r.failed, 'restore failed: ' + r.alerts.join(' | '));
    eq(dst.db.ids('system').filter(i => i.startsWith('res_')), ['res_1', 'res_2'], 'restored reservations');
    eq(dst.db.get('system', 'counters').globalSequenceCounter, 2, 'gsc');
    // Legacy numeric reservation without _firestoreId still derives res_N
    const legacy = structuredClone(b);
    for (const list of [legacy.reservations, legacy.system.reservations]) delete list[0]._firestoreId;
    await resign(legacy);
    const dst2 = freshTargetEnv();
    const r2 = await runRestore(dst2, legacy);
    assert(!r2.failed, 'legacy numeric restore failed: ' + r2.alerts.join(' | '));
    assert(dst2.db.get('system', 'res_1'), 'res_1 derived from seqNumber');
    return 'numeric-only and legacy numeric backups restore';
  });

  await test('A4', 'Physical receipts, reservations and operation records preserve links', async () => {
    const dst = freshTargetEnv();
    const r = await runRestore(dst, backup);
    assert(!r.failed, 'restore failed');
    for (const [pid, op] of [['P600', 'op_phys_rcpt_syn600'], ['PU1', 'op_phys_rcpt_synpu1']]) {
      const rc = dst.db.get('receipts', `rcpt_phys_${pid}`);
      const rs = dst.db.get('system', `res_phys_${pid}`);
      const od = dst.db.get('system', op);
      assert(rc && rs && od, `missing linked docs for ${pid}`);
      eq(rc.reservationDocId, `res_phys_${pid}`, 'receipt→reservation');
      eq(rs.receiptDocId, `rcpt_phys_${pid}`, 'reservation→receipt');
      eq(od.receiptDocId, `rcpt_phys_${pid}`, 'op→receipt');
      eq(rs.operationId, op, 'reservation→op'); eq(rc.operationId, op, 'receipt→op');
      eq(rc.isPhysical, true, 'isPhysical');
    }
    // Restored state must still support an idempotent physical replay
    dst.sb; // same sandbox shares dst.db
    const replay = await dst.sb.fsCreatePhysicalReceipt(physInput('P600', { operationId: 'op_phys_rcpt_syn600' }));
    eq(replay.isIdempotentReplay, true, 'post-restore physical replay');
    return 'P600 and PU1 link chains intact; post-restore replay OK';
  });

  await test('A5', 'Corrupt or ambiguous physical records are rejected (fail closed, zero writes)', async () => {
    const cases = {
      'physicalId conflicts with _firestoreId': r => { r.physicalId = 'P601'; },
      'numeric seqNumber on physical record': r => { r.seqNumber = 7; },
      'missing type': r => { delete r.type; },
      'out-of-range ID': r => { r._firestoreId = 'res_phys_P999'; r.physicalId = 'P999'; r.formattedNo = 'P999'; r.receiptNo = 'P999'; },
      'non-canonical ID (lower case)': r => { r._firestoreId = 'res_phys_p600'; },
      'no identifier at all': r => { delete r._firestoreId; delete r.physicalId; delete r.formattedNo; },
      'receiptDocId mismatch': r => { r.receiptDocId = 'rcpt_phys_P601'; },
      'physical type under numeric ID': r => { r._firestoreId = 'res_9'; }
    };
    const out = [];
    for (const [label, mutate] of Object.entries(cases)) {
      const bad = structuredClone(backup);
      for (const list of [bad.reservations, bad.system.reservations]) mutate(list.find(r => r.physicalId === 'P600' || r._firestoreId === 'res_phys_P600'));
      await resign(bad);
      const dst = freshTargetEnv();
      const r = await runRestore(dst, bad);
      assert(r.failed, `"${label}" was NOT rejected`);
      assert(dst.db.writes.length === 0, `"${label}" produced ${dst.db.writes.length} writes before rejection`);
      out.push(label);
    }
    // Missing linked physical receipt
    const noRcpt = structuredClone(backup);
    noRcpt.collections.receipts = noRcpt.collections.receipts.filter(r => r._firestoreId !== 'rcpt_phys_P600');
    await resign(noRcpt);
    const d1 = freshTargetEnv(); const r1 = await runRestore(d1, noRcpt);
    assert(r1.failed && d1.db.writes.length === 0, 'missing linked physical receipt not rejected');
    // Physical op pointing at wrong receipt
    const badOp = structuredClone(backup);
    for (const list of [badOp.idempotency, badOp.system.idempotency]) list.find(o => o._firestoreId === 'op_phys_rcpt_syn600').receiptDocId = 'rcpt_phys_PU1';
    await resign(badOp);
    const d2 = freshTargetEnv(); const r2 = await runRestore(d2, badOp);
    assert(r2.failed && d2.db.writes.length === 0, 'inconsistent physical op not rejected');
    // Duplicate physical reservation
    const dup = structuredClone(backup);
    const p = dup.reservations.find(r => r._firestoreId === 'res_phys_P600');
    dup.reservations.push(structuredClone(p)); dup.system.reservations = dup.reservations;
    await resign(dup);
    const d3 = freshTargetEnv(); const r3 = await runRestore(d3, dup);
    assert(r3.failed && d3.db.writes.length === 0, 'duplicate physical reservation not rejected');
    // Tampered (unsigned change) backup still caught by integrity hash
    const tampered = structuredClone(backup);
    tampered.reservations.find(r => r._firestoreId === 'res_phys_P600').amount = 99999;
    const d4 = freshTargetEnv(); const r4 = await runRestore(d4, tampered);
    assert(r4.failed && r4.alerts[0].includes('integrity check FAILED'), 'tampered backup not rejected by integrity hash');
    return `${out.length + 4} corrupt variants rejected with 0 writes`;
  });

  // ── Fix B ───────────────────────────────────────────────────────────────
  console.log('\nFix B — independent receipt commissioning guard');

  await test('B6', 'New independent receipt is blocked at sequence zero', async () => {
    const e = makeEnv(); seedMaster(e.db); seedCounters(e.db, 0);
    let err = null;
    try { await e.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_blocked' })); } catch (x) { err = x; }
    assert(err, 'independent receipt was NOT blocked');
    assert(/first transaction/i.test(err.message) && /billing/i.test(err.message), 'unclear error: ' + err.message);
    eq(e.db.writes.length, 0, 'writes after blocked attempt');
    eq(e.db.get('system', 'counters').globalSequenceCounter, 0, 'gsc');
    // Manual number "001" is also blocked
    let err2 = null;
    try { await e.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_blocked2', manualReceiptNo: '001' })); } catch (x) { err2 = x; }
    assert(err2 && /first transaction/i.test(err2.message), 'manual R-001 not blocked');
    // Missing counters document is also treated as uncommissioned
    const e2 = makeEnv(); seedMaster(e2.db);
    let err3 = null;
    try { await e2.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_blocked3' })); } catch (x) { err3 = x; }
    assert(err3 && /first transaction/i.test(err3.message), 'missing counters doc not blocked');
    return err.message;
  });

  await test('B7', 'First billing transaction allocates BILL-001 and R-001', async () => {
    const e = makeEnv(); seedMaster(e.db); seedCounters(e.db, 0);
    const res = await e.sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_first' }));
    const bill = e.db.get('billing', 'bill_1');
    const rc = e.db.get('receipts', 'rcpt_1');
    assert(bill && rc, 'bill_1/rcpt_1 not created');
    const billNo = bill.billReceiptNo || bill.billNo || bill.receiptNo;
    eq(billNo, 'BILL-001', 'bill number');
    eq(rc.receiptNo, 'R-001', 'receipt number');
    eq(e.db.get('system', 'counters').globalSequenceCounter, 1, 'gsc');
    assert(res && !res.isIdempotentReplay, 'unexpected replay flag');
    return 'BILL-001 / R-001, gsc=1';
  });

  await test('B8', 'Independent receipt succeeds after commissioning', async () => {
    const e = makeEnv(); seedMaster(e.db); seedCounters(e.db, 0);
    await e.sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_c1' }));
    const r = await e.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_c2' }));
    eq(r.receiptRecord.receiptNo, 'R-002', 'receipt number');
    eq(e.db.get('system', 'counters').globalSequenceCounter, 2, 'gsc');
    // Pre-existing commissioned counter (e.g. 41) behaves exactly as before
    const e2 = makeEnv(); seedMaster(e2.db); seedCounters(e2.db, 41);
    const r2 = await e2.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_42' }));
    eq(r2.receiptRecord.receiptNo, 'R-042', 'receipt number at gsc 41');
    const r3 = await e2.sb.fsCreateIndependentReceipt(receiptInput({ operationId: 'op_rcpt_43', manualReceiptNo: 'R-043' }));
    eq(r3.receiptRecord.receiptNo, 'R-043', 'manual receipt number at gsc 42');
    return 'R-002 after BILL-001; R-042/R-043 on commissioned counter';
  });

  await test('B9', 'Already committed idempotent retry remains safe', async () => {
    const e = makeEnv(); seedMaster(e.db); seedCounters(e.db, 0);
    await e.sb.fsCreateBillingWithAccounting(billingInput({ operationId: 'op_bill_i1' }));
    const input = receiptInput({ operationId: 'op_rcpt_i2' });
    const first = await e.sb.fsCreateIndependentReceipt(input);
    // Simulate a post-cleanup counter reset to 0 while the committed op still exists
    e.db.put('system', 'counters', { ...e.db.get('system', 'counters'), globalSequenceCounter: 0 });
    const writesBefore = e.db.writes.length;
    const retry = await e.sb.fsCreateIndependentReceipt(input);
    eq(retry.isIdempotentReplay, true, 'replay flag');
    eq(retry.receiptRecord.receiptNo, first.receiptRecord.receiptNo, 'replayed receipt number');
    eq(e.db.writes.length, writesBefore, 'replay writes');
    // Normal-state retry (counter commissioned) also replays
    e.db.put('system', 'counters', { ...e.db.get('system', 'counters'), globalSequenceCounter: 2 });
    const retry2 = await e.sb.fsCreateIndependentReceipt(input);
    eq(retry2.isIdempotentReplay, true, 'replay flag (commissioned)');
    return `replay returned ${retry.receiptRecord.receiptNo} with 0 writes, even at gsc 0`;
  });

  await test('B10', 'Physical receipt creation remains unaffected', async () => {
    const e = makeEnv(); seedMaster(e.db); seedCounters(e.db, 0);
    const p = await e.sb.fsCreatePhysicalReceipt(physInput('P650', { operationId: 'op_phys_rcpt_b10' }));
    eq(p.receiptRecord.receiptNo, 'P650', 'physical number');
    eq(e.db.get('system', 'counters').globalSequenceCounter, 0, 'gsc untouched');
    assert(!e.db.writes.some(w => w.path === 'system/counters'), 'physical receipt wrote counters');
    // Delegation from the independent-receipt entry point still works at gsc 0
    const d = await e.sb.fsCreateIndependentReceipt(physInput('PU2', { operationId: 'op_phys_rcpt_b10b' }));
    eq(d.receiptRecord.receiptNo, 'PU2', 'delegated physical number');
    eq(e.db.get('system', 'counters').globalSequenceCounter, 0, 'gsc still untouched');
    const replay = await e.sb.fsCreatePhysicalReceipt(physInput('P650', { operationId: 'op_phys_rcpt_b10' }));
    eq(replay.isIdempotentReplay, true, 'physical replay');
    return 'P650 & delegated PU2 created at gsc 0; counters never written';
  });

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({
      step: '33.137', target: TARGET,
      targetSha256: nodeCrypto.createHash('sha256').update(fs.readFileSync(TARGET)).digest('hex').toUpperCase(),
      runAt: new Date().toISOString(), environment: 'Node vm sandbox + in-memory mock Firestore (synthetic only, no network)',
      passed, total: results.length, results
    }, null, 2));
  }
  process.exitCode = passed === results.length ? 0 : 1;
})().catch(e => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
