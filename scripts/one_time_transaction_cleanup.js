/**
 * ONE-TIME TRANSACTION CLEANUP SCRIPT (STEP 33.152)
 * Location: scripts/one_time_transaction_cleanup.js
 *
 * PURPOSE: Manifest-driven, offline, dry-run-only cleanup planner for confirmed
 * test transactions in the Temple Accounts Firebase Firestore database.
 *
 * SAFETY INVARIANTS (PERMANENTLY LOCKED):
 *  1. ZERO Firebase/Admin/Firestore SDK, network, or credential imports.
 *  2. ZERO live database adapter. Strictly offline - reads only local files.
 *  3. Default dry-run: planning mode unconditionally enabled, execution disabled.
 *  4. ALL destructive entry points throw EXECUTE_MODE_DISABLED unconditionally.
 *  5. NO bypass: no env var, CLI flag, manifest field, or config switch.
 *  6. Strict allowlist for eligible test transaction collections.
 *  7. Strict preservation of master data, physical receipts, counters.
 *  8. Manifest scope/schema/checksum/staleness/duplicate/fingerprint enforced.
 *  9. No credentials, secrets, or production data stored in output.
 * 10. Human-readable review report + machine-readable deletion plan.
 *
 * BACKUP OMISSIONS (documented):
 *  - _restoreProgress, _resetJournal, _maintenanceLock, _cleanupProgress excluded.
 *  - Firebase Auth users/passwords NOT backed up.
 *  - firestore.rules NOT backed up.
 *  - Application restore is additive safe-merge, NOT exact rollback.
 *  - File SHA-256 confirms raw byte integrity; NOT complete Firestore coverage.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---- Constants ----
const SCRIPT_VERSION = '33.152.0';
const MANIFEST_SCHEMA_VERSION = '33.152';
const MANIFEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_BACKUP_COLLECTIONS = Object.freeze([
  'bankAccounts','billing','chittyCollections','chittyMembers',
  'chittyPayouts','expenseCategories','funds','incomeCategories',
  'loans','payments','receipts','settings','transfers'
]);
const DOCUMENTED_BACKUP_EXCLUSIONS = Object.freeze([
  '_cleanupProgress','_maintenanceLock','_resetJournal','_restoreProgress',
  '__system_diagnostics__','migration_staging'
]);
const PROTECTED_COLLECTIONS = Object.freeze([
  'bankAccounts','chittyMembers','expenseCategories','funds',
  'incomeCategories','settings','users'
]);
const PROTECTED_SYSTEM_DOCS = Object.freeze([
  '_cleanupProgress','_maintenanceLock','_resetJournal','_restoreProgress','counters'
]);
const ELIGIBLE_COLLECTION_ALLOWLIST = new Set([
  'billing','receipts','payments','transfers','loans',
  'chittyCollections','chittyPayouts','migration_staging',
  '__system_diagnostics__','system'
]);
// Per-collection ID patterns from getDeterministicDocPrefix() + app Firestore logic.
const COLLECTION_ID_PATTERNS = {
  billing:                /^bill_[0-9]+$/,
  receipts:               /^rcpt_[0-9]+$/,
  payments:               /^(pmt_[A-Za-z0-9_-]+|pay_[0-9]+)$/,
  transfers:              /^(tx_[A-Za-z0-9_-]+|transfer_[0-9]+)$/,
  loans:                  /^loan_[A-Za-z0-9_-]+$/,
  chittyCollections:      /^cc_[A-Za-z0-9_-]+$/,
  chittyPayouts:          /^cp_[A-Za-z0-9_-]+$/,
  migration_staging:      /^(batch_stage_[A-Za-z0-9_-]+|stage_[A-Za-z0-9_-]+|migration_[A-Za-z0-9_-]+)$/,
  __system_diagnostics__: /^(test_[A-Za-z0-9_-]+|diag_[A-Za-z0-9_-]+)$/,
  system_reservation:     /^res_[0-9]+$/,
  system_idempotency:     /^op_[A-Za-z0-9_-]+$/
};

// ---- Crypto ----
function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') { return JSON.stringify(val); }
  if (Array.isArray(val)) {
    return '[' + val.map(item => (item === undefined || typeof item === 'function') ? 'null' : canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const entries = [];
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined && typeof v !== 'function') entries.push(JSON.stringify(k) + ':' + canonicalJsonStringify(v));
  }
  return '{' + entries.join(',') + '}';
}
function computeSha256(str) { return crypto.createHash('sha256').update(str,'utf8').digest('hex').toUpperCase(); }
function computeFileSha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(); }
function computeBackupPayloadHash(b) {
  return computeSha256(canonicalJsonStringify({
    collections: b.collections||{}, counters: b.counters||null,
    idempotency: b.idempotency||[], reservations: b.reservations||[], system: b.system||{}
  }));
}

// ---- Backup Verification ----
function verifyBackup(rawBytes, options) {
  options = options || {};
  if (!Buffer.isBuffer(rawBytes)) throw new Error('BACKUP_VERIFICATION_ERROR: rawBytes must be a Buffer.');
  const fileHash = computeFileSha256(rawBytes);
  if (options.expectedFileHash) {
    const exp = String(options.expectedFileHash).trim().toUpperCase();
    if (fileHash !== exp) throw new Error('BACKUP_FILE_HASH_MISMATCH: Expected ' + exp + ' but computed ' + fileHash);
  }
  let parsed;
  try { parsed = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) { throw new Error('BACKUP_PARSE_ERROR: Not valid JSON: ' + e.message); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('BACKUP_SCHEMA_ERROR: Root must be JSON object.');
  const meta = parsed.metadata;
  if (!meta || typeof meta !== 'object') throw new Error('BACKUP_SCHEMA_ERROR: Missing metadata.');
  if (meta.source !== 'firestore') throw new Error('BACKUP_SCHEMA_ERROR: metadata.source must be firestore.');
  const rawTs   = meta.exportedAt || meta.timestamp || meta.exportTimestamp;
  const rawSnap = meta.snapshotId || meta.snapshotIdentifier || meta.backupVersion;
  if (!rawTs && !rawSnap) throw new Error('BACKUP_IDENTITY_ERROR: Backup lacks timestamp and snapshot identifier.');
  const im = meta.integrity || (meta.sha256 ? { hash: meta.sha256 } : null);
  if (!im || !im.hash) throw new Error('BACKUP_INTEGRITY_ERROR: Missing integrity hash.');
  const expH = String(im.hash).trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(expH)) throw new Error('BACKUP_INTEGRITY_ERROR: Malformed hash.');
  const comp = computeBackupPayloadHash(parsed);
  if (comp !== expH) throw new Error('BACKUP_INTEGRITY_MISMATCH: Computed ' + comp + ' stored ' + expH);
  if (!parsed.collections || typeof parsed.collections !== 'object') throw new Error('BACKUP_SCHEMA_ERROR: Missing collections.');
  for (const rc of REQUIRED_BACKUP_COLLECTIONS) {
    if (!Array.isArray(parsed.collections[rc])) throw new Error('BACKUP_COVERAGE_ERROR: Missing collection ' + rc);
  }
  return { fileHash, payloadHash: comp, parsedBackup: parsed };
}

// ---- Manifest Verification ----
function verifyManifest(rawBytes, bfHash, bpHash, options) {
  options = options || {};
  if (!Buffer.isBuffer(rawBytes)) throw new Error('MANIFEST_VERIFICATION_ERROR: rawBytes must be a Buffer.');
  const mfHash = computeFileSha256(rawBytes);
  if (options.expectedManifestFileHash) {
    const exp = String(options.expectedManifestFileHash).trim().toUpperCase();
    if (mfHash !== exp) throw new Error('MANIFEST_FILE_HASH_MISMATCH: Expected ' + exp + ' computed ' + mfHash);
  }
  let m;
  try { m = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) { throw new Error('MANIFEST_PARSE_ERROR: Not valid JSON: ' + e.message); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('MANIFEST_SCHEMA_ERROR: Root must be JSON object.');
  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) throw new Error('MANIFEST_SCHEMA_VERSION_ERROR: Expected ' + MANIFEST_SCHEMA_VERSION + ' got ' + m.schemaVersion);
  for (const f of ['generatedAt','backupFileHash','backupPayloadHash','targets','manifestHash']) {
    if (m[f] === undefined || m[f] === null) throw new Error('MANIFEST_SCHEMA_ERROR: Missing field ' + f);
  }
  if (String(m.backupFileHash).trim().toUpperCase() !== bfHash) throw new Error('MANIFEST_IDENTITY_MISMATCH: backupFileHash mismatch.');
  if (String(m.backupPayloadHash).trim().toUpperCase() !== bpHash) throw new Error('MANIFEST_IDENTITY_MISMATCH: backupPayloadHash mismatch.');
  if (typeof m.generatedAt !== 'string' || !m.generatedAt.trim()) throw new Error('MANIFEST_SCHEMA_ERROR: generatedAt must be non-empty string.');
  const gMs = Date.parse(m.generatedAt);
  if (isNaN(gMs)) throw new Error('MANIFEST_SCHEMA_ERROR: generatedAt not valid ISO-8601.');
  const maxAge = typeof options.maxAgeMs === 'number' ? options.maxAgeMs : MANIFEST_MAX_AGE_MS;
  const age = Date.now() - gMs;
  if (age > maxAge) throw new Error('MANIFEST_STALE: Age ' + Math.round(age/3600000) + 'h exceeds max ' + Math.round(maxAge/3600000) + 'h.');
  if (!Array.isArray(m.targets)) throw new Error('MANIFEST_SCHEMA_ERROR: targets must be array.');
  const hp = { backupFileHash:m.backupFileHash, backupPayloadHash:m.backupPayloadHash,
               generatedAt:m.generatedAt, schemaVersion:m.schemaVersion, targets:m.targets };
  const ch = computeSha256(canonicalJsonStringify(hp));
  if (ch !== String(m.manifestHash).trim().toUpperCase()) throw new Error('MANIFEST_HASH_MISMATCH: Computed ' + ch + ' stored ' + m.manifestHash + '. Manifest was modified.');
  return { manifestFileHash: mfHash, parsedManifest: m };
}

// ---- Target Entry Validation ----
function validateTargetEntry(entry, index) {
  const ctx = 'targets[' + index + ']';
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { valid:false, reason:ctx+': not an object' };
  const { collection, id, docSha256 } = entry;
  if (typeof collection !== 'string' || !collection.trim()) return { valid:false, reason:ctx+': missing collection' };
  if (typeof id !== 'string' || !id.trim()) return { valid:false, reason:ctx+': missing id' };
  if (typeof docSha256 !== 'string' || !/^[0-9A-Fa-f]{64}$/.test(docSha256.trim())) return { valid:false, reason:ctx+': invalid docSha256' };
  if (id.includes('/') || id.includes('\\') || id.includes('..') || /[\x00-\x1F\x7F]/.test(id)) return { valid:false, reason:ctx+': id contains invalid chars' };
  if (PROTECTED_COLLECTIONS.includes(collection)) return { valid:false, reason:ctx+': collection '+collection+' is protected master data' };
  if (!ELIGIBLE_COLLECTION_ALLOWLIST.has(collection)) return { valid:false, reason:ctx+': collection '+collection+' not in allowlist' };
  if (collection === 'system') {
    if (id.startsWith('res_phys_') || id.startsWith('op_phys_')) return { valid:false, reason:ctx+': '+id+' is physical tracking record - protected' };
    if (PROTECTED_SYSTEM_DOCS.includes(id)) return { valid:false, reason:ctx+': '+id+' is protected system metadata' };
    if (!COLLECTION_ID_PATTERNS.system_reservation.test(id) && !COLLECTION_ID_PATTERNS.system_idempotency.test(id))
      return { valid:false, reason:ctx+': '+id+' does not match res_N or op_* pattern' };
  } else {
    const pat = COLLECTION_ID_PATTERNS[collection];
    if (pat && !pat.test(id)) return { valid:false, reason:ctx+': id '+id+' does not match pattern for '+collection };
  }
  if (collection === 'receipts' && id.startsWith('rcpt_phys_')) return { valid:false, reason:ctx+': '+id+' is physical receipt - protected' };
  return { valid: true };
}

// ---- Document Fingerprint Verification ----
function verifyDocumentFingerprint(parsedBackup, collection, id, expectedSha256) {
  const expH = String(expectedSha256).trim().toUpperCase();
  let doc = null;
  if (collection === 'system') {
    const res = parsedBackup.reservations || (parsedBackup.system && parsedBackup.system.reservations) || [];
    const op  = parsedBackup.idempotency  || (parsedBackup.system && parsedBackup.system.idempotency)  || [];
    doc = res.find(r => (r._firestoreId||'') === id) || op.find(o => (o._firestoreId||o.operationId||'') === id) || null;
  } else {
    const col = parsedBackup.collections && parsedBackup.collections[collection];
    if (!Array.isArray(col)) return { found:false, fingerprintMatch:false, computedHash:null, doc:null };
    doc = col.find(d => (d._firestoreId||'') === id) || null;
  }
  if (!doc) return { found:false, fingerprintMatch:false, computedHash:null, doc:null };
  const ch = computeSha256(canonicalJsonStringify(doc)).toUpperCase();
  return { found:true, fingerprintMatch:ch===expH, computedHash:ch, doc };
}

// ---- Linked-Record Relationship Verification ----
function verifyLinkedRecords(targets, backup) {
  const errors = []; const verifiedEdges = [];
  const bills  = targets.filter(t => t.collection === 'billing');
  const rcpts  = targets.filter(t => t.collection === 'receipts');
  const resArr = targets.filter(t => t.collection === 'system' && COLLECTION_ID_PATTERNS.system_reservation.test(t.id));
  const opArr  = targets.filter(t => t.collection === 'system' && COLLECTION_ID_PATTERNS.system_idempotency.test(t.id));
  const billsMap = new Map(bills.map(b=>[b.id,b]));
  const rcptMap  = new Map(rcpts.map(r=>[r.id,r]));
  const resMap   = new Map(resArr.map(r=>[r.id,r]));
  const opMap    = new Map(opArr.map(o=>[o.id,o]));
  function getBDoc(col, id) {
    if (col === 'system') {
      const r=(backup.reservations||[]).find(x=>x._firestoreId===id); if(r) return r;
      return (backup.idempotency||[]).find(x=>(x._firestoreId||x.operationId)===id)||null;
    }
    const c=backup.collections&&backup.collections[col]; if(!Array.isArray(c)) return null;
    return c.find(d=>d._firestoreId===id)||null;
  }
  function addEdge(a,b) { verifiedEdges.push(a+' <-> '+b); }
  // 1. Bills
  for (const b of bills) {
    const raw=getBDoc('billing',b.id);
    if(!raw){errors.push('Bill '+b.id+': not in backup');continue;}
    const rId=raw.accountingReceiptId||(raw.id!==undefined?'rcpt_'+raw.id:null);
    if(!rId){errors.push('Bill '+b.id+': missing accountingReceiptId');}
    else if(!rcptMap.has(rId)){errors.push('Broken Cluster: bill '+b.id+' -> receipt '+rId+' not in targets');}
    else{
      const rr=getBDoc('receipts',rId);
      if(rr){
        const bId=rr.billingFirestoreId||(rr.billingId!==undefined?'bill_'+rr.billingId:null);
        if(bId!==b.id) errors.push('Conflicting Reciprocal: bill '+b.id+' <-> rcpt '+rId+' but receipt links '+bId);
        else addEdge('billing/'+b.id,'receipts/'+rId);
      }
    }
    const resId=raw.reservationDocId||(raw.id!==undefined?'res_'+raw.id:null);
    if(!resId){errors.push('Bill '+b.id+': missing reservationDocId');}
    else if(!resMap.has(resId)){errors.push('Broken Cluster: bill '+b.id+' -> res '+resId+' not in targets');}
    else{
      const rr2=getBDoc('system',resId);
      if(rr2){
        if(rr2.billDocId!==b.id) errors.push('Conflicting Reciprocal: bill '+b.id+' -> res '+resId+' but res links '+rr2.billDocId);
        else addEdge('billing/'+b.id,'system/'+resId);
        if(raw.id!==undefined&&rr2.seqNumber!==undefined&&Number(raw.id)!==Number(rr2.seqNumber))
          errors.push('Seq Mismatch: bill '+b.id+' seq '+raw.id+' vs res seqNumber '+rr2.seqNumber);
      }
    }
    if(raw.operationId){
      if(!opMap.has(raw.operationId)) errors.push('Broken Cluster: bill '+b.id+' -> op '+raw.operationId+' not in targets');
      else{
        const op2=getBDoc('system',raw.operationId);
        if(op2&&op2.billDocId&&op2.billDocId!==b.id) errors.push('Conflicting Op: bill '+b.id+' -> op '+raw.operationId+' but op links '+op2.billDocId);
        else if(op2) addEdge('billing/'+b.id,'system/'+raw.operationId);
      }
    }
  }
  // 2. Receipts
  for (const r of rcpts) {
    const raw=getBDoc('receipts',r.id);
    if(!raw){errors.push('Receipt '+r.id+': not in backup');continue;}
    if(r.id.startsWith('rcpt_phys_')||raw.source==='physical'||raw.isPhysical===true||raw.physicalType!==undefined||
       (typeof raw.receiptNo==='string'&&/^(P[0-9]+|PU[0-9]+)$/.test(raw.receiptNo.trim().toUpperCase()))){
      errors.push('PHYSICAL_RECEIPT_PROTECTED: '+r.id+' is physical - must not be in targets');continue;
    }
    const isBill=raw.source==='billing'||!!raw.billingFirestoreId||(raw.billingId!==undefined&&raw.billingId!==null);
    if(isBill){
      const bId=raw.billingFirestoreId||(raw.billingId!==undefined?'bill_'+raw.billingId:null);
      if(!bId) errors.push('Receipt '+r.id+': billing-linked but no billingFirestoreId');
      else if(!billsMap.has(bId)) errors.push('Broken Cluster: receipt '+r.id+' -> bill '+bId+' not in targets');
    }
    const resId2=raw.reservationDocId||(raw.id!==undefined?'res_'+raw.id:null);
    if(resId2){
      if(!resMap.has(resId2)) errors.push('Broken Cluster: receipt '+r.id+' -> res '+resId2+' not in targets');
      else{
        const rr3=getBDoc('system',resId2);
        if(rr3&&rr3.receiptDocId!==r.id) errors.push('Conflicting Reciprocal: receipt '+r.id+' -> res '+resId2+' but res links '+rr3.receiptDocId);
        else if(rr3) addEdge('receipts/'+r.id,'system/'+resId2);
      }
    }
    if(raw.operationId){
      if(!opMap.has(raw.operationId)) errors.push('Broken Cluster: receipt '+r.id+' -> op '+raw.operationId+' not in targets');
      else addEdge('receipts/'+r.id,'system/'+raw.operationId);
    }
  }
  // 3. Reservations
  for (const res of resArr) {
    if(res.id.startsWith('res_phys_')){errors.push('PHYSICAL_RES_PROTECTED: '+res.id);continue;}
    const raw=getBDoc('system',res.id);
    if(!raw){errors.push('Reservation '+res.id+': not in backup');continue;}
    if(raw.billDocId&&!billsMap.has(raw.billDocId)) errors.push('Orphaned Res: '+res.id+' -> bill '+raw.billDocId+' not in targets');
    if(raw.receiptDocId&&!rcptMap.has(raw.receiptDocId)) errors.push('Orphaned Res: '+res.id+' -> receipt '+raw.receiptDocId+' not in targets');
    if(raw.operationId){
      if(!COLLECTION_ID_PATTERNS.system_idempotency.test(raw.operationId)) errors.push('Malformed OpId: res '+res.id+' has bad operationId '+raw.operationId);
      else if(!opMap.has(raw.operationId)) errors.push('Orphaned Res: '+res.id+' -> op '+raw.operationId+' not in targets');
      else{
        const rop=getBDoc('system',raw.operationId);
        if(rop&&!rop.resDocId) errors.push('Ambiguous: res '+res.id+' -> op '+raw.operationId+' has no resDocId');
        else if(rop&&rop.resDocId!==res.id) errors.push('Conflicting Reciprocal: res '+res.id+' -> op '+raw.operationId+' but op links '+rop.resDocId);
        else if(rop) addEdge('system/'+res.id,'system/'+raw.operationId);
      }
    }
  }
  // 4. Idempotency
  for (const op of opArr) {
    if(op.id.startsWith('op_phys_')){errors.push('PHYSICAL_OP_PROTECTED: '+op.id);continue;}
    const raw=getBDoc('system',op.id);
    if(!raw){errors.push('Op '+op.id+': not in backup');continue;}
    if(!raw.resDocId||!COLLECTION_ID_PATTERNS.system_reservation.test(raw.resDocId)) errors.push('Malformed Op: '+op.id+' bad resDocId '+raw.resDocId);
    else if(!resMap.has(raw.resDocId)) errors.push('Stale Op: '+op.id+' -> res '+raw.resDocId+' not in targets');
    else{
      const rr4=getBDoc('system',raw.resDocId);
      if(rr4&&rr4.operationId&&rr4.operationId!==op.id) errors.push('Conflicting Reciprocal: op '+op.id+' -> res '+raw.resDocId+' but res links '+rr4.operationId);
    }
  }
  // 5. ChittyCollections -> members
  const members=(backup.collections&&backup.collections.chittyMembers)||[];
  const mIds=new Set(members.map(m=>String(m._firestoreId||m.id||'')).filter(Boolean));
  for (const cc of targets.filter(t=>t.collection==='chittyCollections')) {
    const raw=getBDoc('chittyCollections',cc.id);
    if(!raw){errors.push('CC '+cc.id+': not in backup');continue;}
    if(raw.memberId!==undefined&&raw.memberId!==null){
      const mid=String(raw.memberId);const mid2=mid.startsWith('cm_')?mid:'cm_'+mid;
      if(!mIds.has(mid)&&!mIds.has(mid2)) errors.push('Broken Ref: cc '+cc.id+' -> memberId '+raw.memberId+' not found');
      else verifiedEdges.push('chittyCollections/'+cc.id+' -> chittyMembers/'+raw.memberId);
    }
  }
  // 6. ChittyPayouts -> members
  for (const cp of targets.filter(t=>t.collection==='chittyPayouts')) {
    const raw=getBDoc('chittyPayouts',cp.id);
    if(!raw){errors.push('CP '+cp.id+': not in backup');continue;}
    if(raw.memberId!==undefined&&raw.memberId!==null){
      const mid=String(raw.memberId);const mid2=mid.startsWith('cm_')?mid:'cm_'+mid;
      if(!mIds.has(mid)&&!mIds.has(mid2)) errors.push('Broken Ref: cp '+cp.id+' -> memberId '+raw.memberId+' not found');
      else verifiedEdges.push('chittyPayouts/'+cp.id+' -> chittyMembers/'+raw.memberId);
    }
  }
  // 7. Migration staging nested subcollection block
  for (const st of targets.filter(t=>t.collection==='migration_staging')) {
    const raw=getBDoc('migration_staging',st.id);if(!raw)continue;
    if(raw.hasSubcollections===true||raw.subcollections||raw.storeWriteResults||
       (raw.storesCount!==undefined&&Number(raw.storesCount)>0)||
       (raw.totalRecords!==undefined&&Number(raw.totalRecords)>0)||
       (raw.totalWritten!==undefined&&Number(raw.totalWritten)>0)){
      errors.push('Nested Subcollection Block: migration_staging/'+st.id+' - flat deletion unsafe');
    }
  }
  return { errors, verifiedEdges: Array.from(new Set(verifiedEdges)).sort() };
}

// ---- Core Planning ----
function buildDeletionPlan(verifiedBackup, verifiedManifest) {
  const { parsedBackup, fileHash:bfHash, payloadHash:bpHash } = verifiedBackup;
  const { parsedManifest, manifestFileHash } = verifiedManifest;
  const auditLog=[];
  function log(msg,lvl){auditLog.push({timestamp:new Date().toISOString(),level:lvl||'info',message:msg});}
  log('Building deletion plan.');
  const targets=parsedManifest.targets;
  const rejected=[],fpErrors=[],linkErrors=[],warnings=[];
  // 0. Check for interrupted journal or active maintenance lock in system state
  const sysObj = parsedBackup.system || {};
  let journalDoc = null;
  let lockDoc = null;
  if (Array.isArray(sysObj)) {
    journalDoc = sysObj.find(d => d && (d._firestoreId === '_resetJournal' || d.id === '_resetJournal'));
    lockDoc = sysObj.find(d => d && (d._firestoreId === '_maintenanceLock' || d.id === '_maintenanceLock'));
  } else if (typeof sysObj === 'object') {
    journalDoc = sysObj._resetJournal || (Array.isArray(sysObj.other) ? sysObj.other.find(d => d && d._firestoreId === '_resetJournal') : null);
    lockDoc = sysObj._maintenanceLock || (Array.isArray(sysObj.other) ? sysObj.other.find(d => d && d._firestoreId === '_maintenanceLock') : null);
  }
  if (!journalDoc && Array.isArray(parsedBackup.collections && parsedBackup.collections.system)) {
    journalDoc = parsedBackup.collections.system.find(d => d && d._firestoreId === '_resetJournal');
  }
  if (!lockDoc && Array.isArray(parsedBackup.collections && parsedBackup.collections.system)) {
    lockDoc = parsedBackup.collections.system.find(d => d && d._firestoreId === '_maintenanceLock');
  }
  if (journalDoc && (journalDoc.status === 'IN_PROGRESS' || journalDoc.status === 'INTERRUPTED')) {
    linkErrors.push('INTERRUPTED_JOURNAL_DETECTED: System contains an incomplete reset journal (status: ' + journalDoc.status + ', stage: ' + (journalDoc.currentStage || 'unknown') + '). Multi-batch deletion cannot be safely planned over an interrupted state.');
    log('Interrupted journal detected: ' + journalDoc.status, 'error');
  }
  if (lockDoc && (lockDoc.locked === true || lockDoc.active === true)) {
    warnings.push('MAINTENANCE_LOCK_ACTIVE: System maintenance lock is currently engaged.');
    log('Maintenance lock active', 'warn');
  }
  // 1. Deduplicate
  const seen=new Set(),dedup=[];
  for(let i=0;i<targets.length;i++){
    const t=targets[i];
    const key=(t&&typeof t==='object')?(t.collection+'/'+t.id):('__bad_'+i);
    if(seen.has(key)){rejected.push({index:i,entry:t,reason:'DUPLICATE_TARGET: '+key});log('Dup at '+i,'warn');}
    else{seen.add(key);dedup.push({index:i,entry:t});}
  }
  // 2. Schema validate
  const schOk=[];
  for(const {index,entry} of dedup){
    const r=validateTargetEntry(entry,index);
    if(!r.valid){rejected.push({index,entry,reason:r.reason});log('Reject '+index,'warn');}
    else schOk.push({index,entry});
  }
  // 3. Fingerprints
  const fpOk=[];
  for(const {index,entry} of schOk){
    const {collection,id,docSha256}=entry;
    const fp=verifyDocumentFingerprint(parsedBackup,collection,id,docSha256);
    if(!fp.found){
      if(collection==='migration_staging'||collection==='__system_diagnostics__'){
        warnings.push('FINGERPRINT_NOTICE: '+collection+'/'+id+' not in backup (documented exclusion).');
        fpOk.push({index,entry});
      }else fpErrors.push({index,entry,reason:'DOCUMENT_NOT_IN_BACKUP: '+collection+'/'+id});
    }else if(!fp.fingerprintMatch){
      fpErrors.push({index,entry,reason:'FINGERPRINT_MISMATCH: '+collection+'/'+id+' manifest='+String(docSha256).toUpperCase().slice(0,16)+'... backup='+fp.computedHash.slice(0,16)+'...'});
    }else fpOk.push({index,entry});
  }
  // 4. Linkage
  const cands=fpOk.map(t=>t.entry);
  const lr=verifyLinkedRecords(cands,parsedBackup);
  for(const e of lr.errors){linkErrors.push(e);log('Linkage: '+e,'error');}
  log('Edges: '+lr.verifiedEdges.length);
  // 5. Accept
  const accepted=[];
  if(!linkErrors.length&&!fpErrors.length) for(const {entry} of fpOk) accepted.push(entry);
  // 6. Topological stages
  const stages=[
    {stage:1,name:'Historical & Diagnostics',records:accepted.filter(t=>t.collection==='migration_staging'||t.collection==='__system_diagnostics__')},
    {stage:2,name:'Sub-Ledger Financial',records:accepted.filter(t=>['payments','transfers','loans','chittyCollections','chittyPayouts'].includes(t.collection))},
    {stage:3,name:'Accounting Receipts',records:accepted.filter(t=>t.collection==='receipts')},
    {stage:4,name:'Vazhipadu Billing Records',records:accepted.filter(t=>t.collection==='billing')},
    {stage:5,name:'Software Sequences & Idempotency',records:accepted.filter(t=>t.collection==='system')}
  ];
  for(const s of stages) s.records.sort((a,b)=>(a.collection+'/'+a.id).localeCompare(b.collection+'/'+b.id));
  const isEligible=rejected.length===0&&fpErrors.length===0&&linkErrors.length===0;
  log('Plan: '+accepted.length+' accepted, '+rejected.length+' rejected, '+fpErrors.length+' fp, '+linkErrors.length+' link. Eligible:'+isEligible);
  return {
    dryRun:true,executionLocked:true,planBuiltAt:new Date().toISOString(),scriptVersion:SCRIPT_VERSION,
    backupFileHash:bfHash,backupPayloadHash:bpHash,manifestFileHash,manifestGeneratedAt:parsedManifest.generatedAt,
    totalManifestTargets:targets.length,acceptedTargets:accepted,rejectedEntries:rejected,
    fingerprintErrors:fpErrors,linkageErrors:linkErrors,warnings,verifiedEdges:lr.verifiedEdges,
    topologicalBatches:stages,isEligible,
    backupOmissionsNotice:[
      'Application backup does NOT include: _restoreProgress, _resetJournal, _maintenanceLock, _cleanupProgress.',
      'Firebase Auth users/passwords NOT included.',
      'firestore.rules NOT included.',
      'Application restore is additive safe-merge - NOT exact rollback.',
      'File SHA-256 proves raw byte integrity only; not complete Firestore coverage.',
      'gcloud firestore export required before any live cleanup execution.'
    ],
    auditLog
  };
}

// ---- Review Report ----
function produceReviewReport(plan) {
  const R=[];const hr=(c,n)=>{c=c||'=';n=n||72;R.push(c.repeat(n));};
  hr();R.push('  TEMPLE ACCOUNTS ONE-TIME CLEANUP REVIEW REPORT (STEP 33.152)');hr();
  R.push('  Script Version : '+plan.scriptVersion);
  R.push('  Report Date    : '+plan.planBuiltAt);
  R.push('  Mode           : DRY-RUN ONLY (execution permanently locked)');
  R.push('  Eligible       : '+(plan.isEligible?'YES - Plan is internally consistent':'NO - See errors below'));
  hr();R.push('');
  R.push('SECTION 1 - SOURCE IDENTITY');hr('-',40);
  R.push('  Backup File SHA-256    : '+plan.backupFileHash);
  R.push('  Backup Payload SHA-256 : '+plan.backupPayloadHash);
  R.push('  Manifest File SHA-256  : '+plan.manifestFileHash);
  R.push('  Manifest Generated At  : '+plan.manifestGeneratedAt);
  R.push('');R.push('SECTION 2 - BACKUP OMISSIONS');hr('-',40);
  for(const n of plan.backupOmissionsNotice) R.push('  NOTICE: '+n);
  R.push('');R.push('SECTION 3 - TARGET SUMMARY');hr('-',40);
  R.push('  Total manifest targets : '+plan.totalManifestTargets);
  R.push('  Accepted               : '+plan.acceptedTargets.length);
  R.push('  Rejected               : '+plan.rejectedEntries.length);
  R.push('  Fingerprint errors     : '+plan.fingerprintErrors.length);
  R.push('  Linkage errors         : '+plan.linkageErrors.length);
  R.push('  Warnings               : '+plan.warnings.length);
  R.push('  Verified edges         : '+plan.verifiedEdges.length);
  R.push('');R.push('SECTION 4 - TOPOLOGICAL STAGES');hr('-',40);
  for(const s of plan.topologicalBatches){
    R.push('  Stage '+s.stage+': '+s.name+' ('+s.records.length+' records)');
    for(const r of s.records) R.push('      '+r.collection+'/'+r.id+'  ['+String(r.docSha256).toUpperCase().slice(0,16)+'...]');
  }
  if(plan.rejectedEntries.length){R.push('');R.push('SECTION 5 - REJECTED');hr('-',40);for(const x of plan.rejectedEntries)R.push('  ['+x.index+'] '+x.reason);}
  if(plan.fingerprintErrors.length){R.push('');R.push('SECTION 6 - FINGERPRINT ERRORS');hr('-',40);for(const x of plan.fingerprintErrors)R.push('  ['+x.index+'] '+x.reason);}
  if(plan.linkageErrors.length){R.push('');R.push('SECTION 7 - LINKAGE ERRORS');hr('-',40);for(const x of plan.linkageErrors)R.push('  * '+x);}
  if(plan.warnings.length){R.push('');R.push('SECTION 8 - WARNINGS');hr('-',40);for(const x of plan.warnings)R.push('  WARN: '+x);}
  R.push('');R.push('SECTION 9 - VERIFIED EDGES');hr('-',40);
  if(!plan.verifiedEdges.length) R.push('  (none)');
  else for(const e of plan.verifiedEdges) R.push('  OK: '+e);
  R.push('');hr();R.push('  EXECUTION STATUS: UNCONDITIONALLY LOCKED');
  R.push('  All deletion methods throw EXECUTE_MODE_DISABLED.');hr();
  return R.join('\n');
}

// ---- Serializer ----
function serializeDeletionPlan(plan) {
  return {
    schemaVersion:MANIFEST_SCHEMA_VERSION,scriptVersion:plan.scriptVersion,
    planBuiltAt:plan.planBuiltAt,dryRun:true,executionLocked:true,isEligible:plan.isEligible,
    sourceIdentity:{backupFileHash:plan.backupFileHash,backupPayloadHash:plan.backupPayloadHash,
                    manifestFileHash:plan.manifestFileHash,manifestGeneratedAt:plan.manifestGeneratedAt},
    summary:{totalManifestTargets:plan.totalManifestTargets,acceptedTargets:plan.acceptedTargets.length,
             rejectedEntries:plan.rejectedEntries.length,fingerprintErrors:plan.fingerprintErrors.length,
             linkageErrors:plan.linkageErrors.length,warnings:plan.warnings.length,verifiedEdges:plan.verifiedEdges.length},
    topologicalBatches:plan.topologicalBatches.map(b=>({
      stage:b.stage,name:b.name,count:b.records.length,
      records:b.records.map(r=>({collection:r.collection,id:r.id,docSha256:r.docSha256}))
    })),
    rejectedEntries:plan.rejectedEntries,fingerprintErrors:plan.fingerprintErrors,
    linkageErrors:plan.linkageErrors,warnings:plan.warnings,verifiedEdges:plan.verifiedEdges,
    backupOmissionsNotice:plan.backupOmissionsNotice,
    auditLog:plan.auditLog.map(e=>({timestamp:e.timestamp,level:e.level,message:e.message}))
  };
}

// ---- UNCONDITIONAL EXECUTION LOCK ----
function execute() {
  const e=new Error('EXECUTE_MODE_DISABLED: Execution mode is permanently and unconditionally disabled in STEP 33.152. Live deletion of Firestore documents is strictly prohibited. A future separately reviewed execution adapter is required.');
  e.code='EXECUTE_MODE_DISABLED';e.deletionsPerformed=0;e.mutationsPerformed=0;throw e;
}
function executeCleanup()          { return execute(); }
function performLiveDeletion()     { return execute(); }
function executeBatchedDeletions() { return execute(); }
function deleteDocument()          { return execute(); }

// ---- CLI ----
function runCli() {
  const args=process.argv.slice(2);
  const forbidden=['--execute','--run','--delete','--force','--live','--unlock','-e'];
  for(const f of forbidden){if(args.includes(f)){console.error('[FATAL] EXECUTE_MODE_DISABLED');process.exit(1);}}
  if(!args.length||args.includes('--help')||args.includes('-h')){
    console.log('\nTemple Accounts One-Time Cleanup (STEP 33.152)\nUsage:\n  --plan <backup.json> <manifest.json>\n  --verify-backup <backup.json>\n  --verify-manifest <backup.json> <manifest.json>\n\nExecution unconditionally locked.\n');
    process.exit(0);
  }
  function readF(p,label){
    if(!p||!fs.existsSync(p)){console.error('[ERROR] '+label+' not found: '+p);process.exit(1);}
    try{return fs.readFileSync(p);}catch(e2){console.error('[ERROR] Cannot read '+label+': '+e2.message);process.exit(1);}
  }
  if(args.includes('--verify-backup')){
    const raw=readF(args[args.indexOf('--verify-backup')+1],'backup');
    try{const r=verifyBackup(raw);console.log('Backup: VALID\n  File: '+r.fileHash+'\n  Payload: '+r.payloadHash);process.exit(0);}
    catch(e){console.error('Backup: INVALID - '+e.message);process.exit(1);}
  }
  if(args.includes('--verify-manifest')){
    const i=args.indexOf('--verify-manifest');
    const bRaw=readF(args[i+1],'backup'),mRaw=readF(args[i+2],'manifest');
    try{const bv=verifyBackup(bRaw),mv=verifyManifest(mRaw,bv.fileHash,bv.payloadHash);
    console.log('Binding: VALID\n  Backup: '+bv.fileHash+'\n  Manifest: '+mv.manifestFileHash);process.exit(0);}
    catch(e){console.error('FAILED: '+e.message);process.exit(1);}
  }
  if(args.includes('--plan')){
    const i=args.indexOf('--plan');
    const bRaw=readF(args[i+1],'backup'),mRaw=readF(args[i+2],'manifest');
    try{const vb=verifyBackup(bRaw),vm=verifyManifest(mRaw,vb.fileHash,vb.payloadHash);
    const plan=buildDeletionPlan(vb,vm);
    console.log('\n'+produceReviewReport(plan));
    console.log('\n--- MACHINE-READABLE PLAN ---\n');
    console.log(JSON.stringify(serializeDeletionPlan(plan),null,2));
    process.exit(plan.isEligible?0:2);}
    catch(e){console.error('\n[PLAN ERROR] '+e.message);process.exit(1);}
  }
  console.error('[ERROR] Unknown option. Run with --help.');
  process.exit(1);
}
if(require.main===module){runCli();}

module.exports = {
  canonicalJsonStringify,computeSha256,computeFileSha256,computeBackupPayloadHash,
  SCRIPT_VERSION,MANIFEST_SCHEMA_VERSION,MANIFEST_MAX_AGE_MS,
  REQUIRED_BACKUP_COLLECTIONS,DOCUMENTED_BACKUP_EXCLUSIONS,PROTECTED_COLLECTIONS,
  PROTECTED_SYSTEM_DOCS,ELIGIBLE_COLLECTION_ALLOWLIST,COLLECTION_ID_PATTERNS,
  verifyBackup,verifyManifest,validateTargetEntry,verifyDocumentFingerprint,
  verifyLinkedRecords,buildDeletionPlan,produceReviewReport,serializeDeletionPlan,
  execute,executeCleanup,performLiveDeletion,executeBatchedDeletions,deleteDocument
};
