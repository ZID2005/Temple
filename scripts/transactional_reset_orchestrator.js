/**
 * TRANSACTIONAL RESET ORCHESTRATOR — DEDICATED PROJECT TOOL (STEP 33.140)
 *
 * Location: scripts/transactional_reset_orchestrator.js
 *
 * PURPOSE:
 * Dedicated administrative reset tool for validating, auditing, and preparing
 * deterministic dry-run manifests for first-use cleanup of test transactions
 * across all financial modules: billing, receipts, payments, transfers, loans,
 * chitty collections, chitty payouts, and obsolete staging/diagnostic records.
 *
 * SAFETY INVARIANTS (100% AIR-GAPPED & PERMANENTLY LOCKED):
 * 1. ZERO Firebase SDK, Firestore SDK, network, or credential imports.
 * 2. ZERO live database adapter — strictly accepts local synthetic/export JSON.
 * 3. Refuses live Firebase URLs, credentials, service accounts, or emulator endpoints.
 * 4. EXECUTION UNCONDITIONALLY DISABLED: All destructive execution entry points
 *    (execute, executeReset, executeCleanup, performLiveDeletion, executeBatchedDeletions)
 *    throw a strict EXECUTE_MODE_DISABLED error before any mutation.
 * 5. NO bypass mechanism exists: override flags, trustee tokens, CLI switches,
 *    and environment variables are incapable of unlocking deletion.
 * 6. Strict allowlist for eligible test transaction schemas.
 * 7. Strict preservation of master data, user accounts, physical receipts,
 *    physical reservations, and counter structures.
 * 8. Deny-by-default fail-closed quarantine for any unknown collections,
 *    unclassified documents, ambiguous records, or reciprocal linkage errors.
 * 9. Deterministic manifest digest: full canonical SHA-256 covering target records
 *    with content fingerprints, verified relationship edges, preserved records,
 *    quarantined records, and topological batch definitions.
 * 10. Documents recovery gap analysis: explains safe-merge nature of application
 *     restore and mandates external managed snapshots before any future live deletion.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Canonical JSON Stringification (RFC 8785 subset) & Cryptographic Hashing
// ---------------------------------------------------------------------------

function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(item => (item === undefined || typeof item === 'function') ? 'null' : canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const entries = [];
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined && typeof v !== 'function') {
      entries.push(JSON.stringify(k) + ':' + canonicalJsonStringify(v));
    }
  }
  return '{' + entries.join(',') + '}';
}

function computeSha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// Target Collection Schema Matchers & Allowlists (Scope Specification)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSACTION_COLLECTIONS = {
  billing: {
    description: 'Vazhipadu billing records (synthetic test bills)',
    idRegex: /^bill_[0-9]+$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `bill_${doc.id}` : null);
      if (!docId || !/^bill_[0-9]+$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      const amt = Number(doc.totalAmount !== undefined ? doc.totalAmount : doc.amount);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      if (!doc.receiptNo || !/^BILL-[0-9]+$/.test(doc.receiptNo)) return false;
      if (!doc.devoteeName || typeof doc.devoteeName !== 'string' || doc.devoteeName.trim() === '') return false;
      if (!doc.fund || typeof doc.fund !== 'string' || doc.fund.trim() === '') return false;
      if (!doc.accountingReceiptId || typeof doc.accountingReceiptId !== 'string') return false;
      if (!doc.reservationDocId || typeof doc.reservationDocId !== 'string') return false;
      return true;
    }
  },
  receipts: {
    description: 'Accounting receipts linked to billing or software sequences',
    idRegex: /^rcpt_[0-9]+$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `rcpt_${doc.id}` : null);
      // Strictly preserve physical receipts (rcpt_phys_*) and documents with source === 'physical'
      if (
        String(docId).startsWith('rcpt_phys_') ||
        doc.source === 'physical' ||
        doc.isPhysical === true ||
        doc.physicalType !== undefined ||
        (typeof doc.receiptNo === 'string' && /^(P[0-9]+|PU[0-9]+)$/.test(doc.receiptNo.trim().toUpperCase()))
      ) {
        return false;
      }
      if (!docId || !/^rcpt_[0-9]+$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      const amt = Number(doc.amount);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      if (!doc.receiptNo || !/^R-[0-9]+$/.test(doc.receiptNo)) return false;
      if (!doc.fund || typeof doc.fund !== 'string' || doc.fund.trim() === '') return false;
      if (!doc.name || typeof doc.name !== 'string' || doc.name.trim() === '') return false;

      // Real app schema: independent receipts have source: 'firestore' (legacy 'independent' also accepted)
      // Billing receipts have source: 'billing'
      const isBilling = doc.source === 'billing' || !!doc.billingFirestoreId || (doc.billingId !== undefined && doc.billingId !== null);
      const isIndependent = (doc.source === 'firestore' || doc.source === 'independent') &&
        (doc.billingId === null || doc.billingId === undefined) &&
        (!doc.billingFirestoreId) &&
        (!doc.billingReceiptNo);

      if (!isBilling && !isIndependent) return false;

      if (!doc.reservationDocId || typeof doc.reservationDocId !== 'string') return false;
      if (isBilling) {
        if (!doc.billingFirestoreId && (doc.billingId === undefined || doc.billingId === null)) return false;
      }
      return true;
    }
  },
  payments: {
    description: 'Payment vouchers (synthetic test expenses/vouchers)',
    idRegex: /^(pmt_[A-Za-z0-9_-]+|pay_[0-9]+)$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `pay_${doc.id}` : null);
      if (!docId || !/^(pmt_[A-Za-z0-9_-]+|pay_[0-9]+)$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      const amt = Number(doc.amount);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      if (!doc.fund || typeof doc.fund !== 'string' || doc.fund.trim() === '') return false;
      // Actual application field is 'category'. Fallback to 'expenseCategory' only if category is absent.
      const cat = doc.category !== undefined ? doc.category : doc.expenseCategory;
      if (typeof cat !== 'string' || cat.trim() === '') return false;
      if (!doc.voucherNo && doc.id === undefined) return false;
      return true;
    }
  },
  transfers: {
    description: 'Contra bank/fund transfers (synthetic test transfers)',
    idRegex: /^(tx_[A-Za-z0-9_-]+|transfer_[0-9]+)$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `tx_${doc.id}` : null);
      if (!docId || !/^(tx_[A-Za-z0-9_-]+|transfer_[0-9]+)$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      const amt = Number(doc.amount);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      // Actual application fields are fromAcc and toAcc (with fromAccount/toAccount legacy fallback)
      const from = doc.fromAcc !== undefined ? doc.fromAcc : doc.fromAccount;
      const to = doc.toAcc !== undefined ? doc.toAcc : doc.toAccount;
      if (typeof from !== 'string' || from.trim() === '') return false;
      if (typeof to !== 'string' || to.trim() === '') return false;
      if (from.trim() === to.trim()) return false;
      return true;
    }
  },
  loans: {
    description: 'Loan transactions (synthetic test loans and repayments)',
    idRegex: /^loan_[A-Za-z0-9_-]+$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `loan_${doc.id}` : null);
      if (!docId || !/^loan_[A-Za-z0-9_-]+$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      // Real schema uses person (with borrowerName legacy fallback)
      const person = doc.person !== undefined ? doc.person : doc.borrowerName;
      if (typeof person !== 'string' || person.trim() === '') return false;

      // Real schema uses loanReceived and repayment (with amount/principalAmount fallback)
      const received = doc.loanReceived !== undefined ? Number(doc.loanReceived) : (doc.principalAmount !== undefined ? Number(doc.principalAmount) : (doc.amount !== undefined ? Number(doc.amount) : 0));
      const repay = doc.repayment !== undefined ? Number(doc.repayment) : 0;

      if (isNaN(received) || isNaN(repay) || !isFinite(received) || !isFinite(repay)) return false;
      if (received < 0 || repay < 0) return false;
      if (received === 0 && repay === 0) return false;
      return true;
    }
  },
  chittyCollections: {
    description: 'Chitty installment collections (synthetic test receipts)',
    idRegex: /^cc_[A-Za-z0-9_-]+$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `cc_${doc.id}` : null);
      if (!docId || !/^cc_[A-Za-z0-9_-]+$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      // Actual application field is amountReceived
      const amt = Number(doc.amountReceived);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      if (doc.memberId === undefined || doc.memberId === null || String(doc.memberId).trim() === '') return false;
      return true;
    }
  },
  chittyPayouts: {
    description: 'Chitty auction payouts (synthetic test vouchers)',
    idRegex: /^cp_[A-Za-z0-9_-]+$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || (doc.id !== undefined ? `cp_${doc.id}` : null);
      if (!docId || !/^cp_[A-Za-z0-9_-]+$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      // Actual application field is amount (remove guessed auctionPrizeAmount assumption, keep only as legacy fallback if needed)
      const amt = Number(doc.amount !== undefined ? doc.amount : doc.auctionPrizeAmount);
      if (isNaN(amt) || amt <= 0 || !isFinite(amt)) return false;
      if (doc.memberId === undefined || doc.memberId === null || String(doc.memberId).trim() === '') return false;
      return true;
    }
  },
  migration_staging: {
    description: 'Obsolete migration staging records from Step 12',
    idRegex: /^(batch_stage_[A-Za-z0-9_-]+|stage_[A-Za-z0-9_-]+|migration_[A-Za-z0-9_-]+)$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || String(doc.id);
      if (!docId || !/^(batch_stage_[A-Za-z0-9_-]+|stage_[A-Za-z0-9_-]+|migration_[A-Za-z0-9_-]+)$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      // If document indicates nested subcollections, it cannot be safely processed as a flat deletion target
      if (
        doc.hasSubcollections === true ||
        doc.subcollections ||
        doc.storeWriteResults ||
        (doc.storesCount !== undefined && Number(doc.storesCount) > 0) ||
        (doc.totalRecords !== undefined && Number(doc.totalRecords) > 0) ||
        (doc.totalWritten !== undefined && Number(doc.totalWritten) > 0)
      ) {
        return false;
      }
      if (doc.recordsCount === undefined && !Array.isArray(doc.stagedRecords) && !doc.status) return false;
      return true;
    }
  },
  __system_diagnostics__: {
    description: 'Diagnostic probe records',
    idRegex: /^(test_[A-Za-z0-9_-]+|diag_[A-Za-z0-9_-]+)$/,
    matcher: (doc) => {
      const docId = doc._firestoreId || String(doc.id);
      if (!docId || !/^(test_[A-Za-z0-9_-]+|diag_[A-Za-z0-9_-]+)$/.test(docId)) return false;
      if (typeof doc !== 'object' || doc === null) return false;
      if (!doc.probeType && !doc.latency && !doc.diagnostic && !doc.timestamp && !doc.status) return false;
      return true;
    }
  }
};

// ---------------------------------------------------------------------------
// Protected Collections & Documents (Immunity Specification)
// ---------------------------------------------------------------------------

const REQUIRED_BACKUP_COLLECTIONS = Object.freeze([
  'bankAccounts',
  'billing',
  'chittyCollections',
  'chittyMembers',
  'chittyPayouts',
  'expenseCategories',
  'funds',
  'incomeCategories',
  'loans',
  'payments',
  'receipts',
  'settings',
  'transfers'
]);

const DOCUMENTED_BACKUP_EXCLUSIONS = Object.freeze([
  '_cleanupProgress',
  '_maintenanceLock',
  '_resetJournal',
  '_restoreProgress',
  '__system_diagnostics__',
  'migration_staging'
]);

const PROTECTED_COLLECTIONS = [
  'settings',
  'funds',
  'incomeCategories',
  'expenseCategories',
  'bankAccounts',
  'chittyMembers',
  'users'
];

const PROTECTED_SYSTEM_DOCS = [
  'counters',          // Initialized via atomic transaction, never deleted
  '_restoreProgress',  // Application recovery audit trail
  '_resetJournal',     // Durable execution and interruption journal
  '_maintenanceLock',  // Operational maintenance guard
  '_cleanupProgress'   // Historical cleanup tracker
];

// ---------------------------------------------------------------------------
// Recovery Design & Gap Analysis Specification
// ---------------------------------------------------------------------------

const RECOVERY_GAP_ANALYSIS = {
  restoreFunctionType: 'safe_merge_non_destructive',
  exactRollbackSupported: false,
  description:
    'The existing application restore function (restoreBackup in Temple_Accounts-1.html:17282-18510) ' +
    'implements an additive safe merge. It updates or inserts records but NEVER drops or deletes unmentioned ' +
    'surplus records. Therefore, application restore cannot provide an exact rollback if unintended deletions occur.',
  unrepresentedCollections: [
    '_restoreProgress (excluded by application backup export design)',
    '_resetJournal (recovery and crash-resilient journal)',
    '_maintenanceLock (operational state)',
    'migration_staging (legacy staging documents)',
    '__system_diagnostics__ (diagnostic probes)'
  ],
  unrepresentedExternalData: [
    'Firebase Authentication users, passwords, and custom claims',
    'Cloud Firestore security rules (firestore.rules)',
    'Cloud Firestore composite indexes (firestore.indexes.json)'
  ],
  mandatoryLivePrecondition:
    'Before any future live cleanup execution can be authorized, an authoritative Google Cloud Firestore managed ' +
    'export (gcloud firestore export) must be completed independently to provide an exact binary point-in-time recovery.'
};

// ---------------------------------------------------------------------------
// Module-Private Verification Registry & Store Bindings (STEP 33.146)
// ---------------------------------------------------------------------------

const trustedSourceIdentities = new WeakSet();
const trustedSourceIdentityData = new WeakMap();
const identityStoreBindings = new WeakMap();
const storeValidationBindings = new WeakMap();

function computeStoreFingerprint(store) {
  const allCols = store.listCollections ? store.listCollections().slice().sort() : [];
  const dump = {};
  for (const c of allCols) {
    const docs = store.list(c) || [];
    dump[c] = docs.map(d => ({
      id: d._firestoreId || String(d.id),
      canon: canonicalJsonStringify(d)
    })).sort((a, b) => a.id.localeCompare(b.id));
  }
  return computeSha256(canonicalJsonStringify(dump));
}

function extractStorePayload(store, presentCollections) {
  const collections = {};
  const targetCols = (Array.isArray(presentCollections) && presentCollections.length > 0)
    ? presentCollections
    : (store.listCollections ? store.listCollections().filter(c => c !== 'system' && c !== 'migration_staging' && c !== '__system_diagnostics__').sort() : []);

  for (const c of targetCols) {
    const docs = (store.list(c) || []).slice();
    docs.sort((a, b) => String(a._firestoreId || a.id).localeCompare(String(b._firestoreId || b.id)));
    collections[c] = docs;
  }

  const reservations = [];
  const idempotency = [];
  const otherSystemDocs = [];
  let counters = null;

  const sysDocs = (store.list('system') || []).slice();
  sysDocs.sort((a, b) => String(a._firestoreId || a.id).localeCompare(String(b._firestoreId || b.id)));
  for (const d of sysDocs) {
    const id = d._firestoreId || String(d.id);
    if (id === 'counters') {
      counters = d;
    } else if (id.startsWith('res_') && !id.startsWith('res_phys_')) {
      reservations.push(d);
    } else if (id.startsWith('op_') && !id.startsWith('op_phys_')) {
      idempotency.push(d);
    } else {
      otherSystemDocs.push(d);
    }
  }

  return {
    collections,
    counters,
    reservations,
    idempotency,
    system: { otherSystemDocs }
  };
}

function bindSourceIdentityToStore(store, sourceIdentity) {
  if (!store || typeof store !== 'object') return false;
  if (!sourceIdentity || typeof sourceIdentity !== 'object') return false;
  if (!trustedSourceIdentities.has(sourceIdentity)) return false;

  const existingStore = identityStoreBindings.get(sourceIdentity);
  if (existingStore && existingStore !== store) {
    throw new Error('SOURCE_IDENTITY_ERROR: This source identity is already bound to another store instance.');
  }

  const identityData = trustedSourceIdentityData.get(sourceIdentity);
  if (!identityData) return false;

  const presentCollections = identityData.expectedCoverage?.presentCollections;
  const storePayload = extractStorePayload(store, presentCollections);
  const recomputedHash = computeSha256(canonicalJsonStringify(storePayload));

  if (recomputedHash !== identityData.canonicalPayloadHash) {
    return false;
  }

  const storeFingerprint = computeStoreFingerprint(store);

  // If store was previously bound to another identity, remove previous reverse link
  const prevBinding = storeValidationBindings.get(store);
  if (prevBinding && prevBinding.boundIdentity && prevBinding.boundIdentity !== sourceIdentity) {
    identityStoreBindings.delete(prevBinding.boundIdentity);
  }

  const validatedCollections = store.listCollections ? store.listCollections().slice().sort() : [];

  identityStoreBindings.set(sourceIdentity, store);
  storeValidationBindings.set(store, {
    boundIdentity: sourceIdentity,
    storeFingerprint,
    storePayloadHash: recomputedHash,
    mutationCount: store.mutationCount || 0,
    validatedCollections
  });

  return true;
}

// ---------------------------------------------------------------------------
// Synthetic In-Memory Database Store (For isolated simulation only)
// ---------------------------------------------------------------------------

class SyntheticFirestore {
  constructor(initialData = {}, options = {}) {
    this.isSynthetic = true;
    this.collections = {};
    this.mutationCount = 0;
    this._sourceIdentity = null;

    const dataCollections = (initialData && initialData.collections && typeof initialData.collections === 'object')
      ? initialData.collections
      : initialData;

    if (dataCollections && typeof dataCollections === 'object') {
      for (const [colName, docs] of Object.entries(dataCollections)) {
        this.collections[colName] = new Map();
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            const id = doc._firestoreId || (doc.id !== undefined ? (
              colName === 'billing' ? `bill_${doc.id}` :
              colName === 'receipts' ? `rcpt_${doc.id}` :
              colName === 'payments' ? `pay_${doc.id}` :
              colName === 'transfers' ? `tx_${doc.id}` :
              colName === 'loans' ? `loan_${doc.id}` :
              colName === 'chittyCollections' ? `cc_${doc.id}` :
              colName === 'chittyPayouts' ? `cp_${doc.id}` :
              String(doc.id)
            ) : null) || String(doc.id);
            this.collections[colName].set(id, JSON.parse(JSON.stringify(doc)));
          }
        } else if (docs && typeof docs === 'object') {
          for (const [id, doc] of Object.entries(docs)) {
            this.collections[colName].set(id, JSON.parse(JSON.stringify(doc)));
          }
        }
      }
    }

    if (initialData && typeof initialData === 'object') {
      if (initialData.counters) {
        this.set('system', 'counters', initialData.counters);
      }
      if (Array.isArray(initialData.reservations)) {
        for (const res of initialData.reservations) {
          const id = res._firestoreId || (res.seqNumber !== undefined ? `res_${res.seqNumber}` : (res.physId ? `res_phys_${res.physId}` : null));
          if (id) this.set('system', id, res);
        }
      }
      if (Array.isArray(initialData.idempotency)) {
        for (const op of initialData.idempotency) {
          const id = op._firestoreId || op.operationId || (op.seqNumber !== undefined ? `op_bill_${op.seqNumber}` : null);
          if (id) this.set('system', id, op);
        }
      }
      if (initialData.system && typeof initialData.system === 'object') {
        if (Array.isArray(initialData.system.otherSystemDocs)) {
          for (const doc of initialData.system.otherSystemDocs) {
            const id = doc._firestoreId || String(doc.id);
            if (id) this.set('system', id, doc);
          }
        }
      }
    }

    // Reset mutation count after constructor population
    this.mutationCount = 0;

    if (options.sourceIdentity) {
      this.setSourceIdentity(options.sourceIdentity);
    }
  }

  get sourceIdentity() {
    return this._sourceIdentity || null;
  }

  set sourceIdentity(id) {
    this.setSourceIdentity(id);
  }

  setSourceIdentity(sourceIdentity) {
    this._sourceIdentity = sourceIdentity;
    if (sourceIdentity && typeof sourceIdentity === 'object' && trustedSourceIdentities.has(sourceIdentity)) {
      try {
        bindSourceIdentityToStore(this, sourceIdentity);
      } catch (err) {
        // Leave unbound if cross-store collision or error
      }
    } else {
      const prev = storeValidationBindings.get(this);
      if (prev && prev.boundIdentity) {
        identityStoreBindings.delete(prev.boundIdentity);
      }
      storeValidationBindings.delete(this);
    }
  }

  clone() {
    const copy = new SyntheticFirestore();
    for (const [colName, map] of Object.entries(this.collections)) {
      copy.collections[colName] = new Map();
      for (const [k, v] of map.entries()) {
        copy.collections[colName].set(k, JSON.parse(JSON.stringify(v)));
      }
    }
    copy.mutationCount = this.mutationCount;
    return copy;
  }

  get(col, id) {
    if (!this.collections[col]) return null;
    const doc = this.collections[col].get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  set(col, id, data) {
    this.mutationCount++;
    if (!this.collections[col]) this.collections[col] = new Map();
    const cloned = JSON.parse(JSON.stringify(data));
    if (!cloned._firestoreId) cloned._firestoreId = id;
    this.collections[col].set(id, cloned);
  }

  delete(col, id) {
    this.mutationCount++;
    if (!this.collections[col]) return false;
    return this.collections[col].delete(id);
  }

  list(col) {
    if (!this.collections[col]) return [];
    return Array.from(this.collections[col].values()).map(d => JSON.parse(JSON.stringify(d)));
  }

  listCollections() {
    return Object.keys(this.collections);
  }
}

// ---------------------------------------------------------------------------
// TransactionalResetOrchestrator Class
// ---------------------------------------------------------------------------

class TransactionalResetOrchestrator {
  constructor(options = {}) {
    // Safety Guard 1: Reject any attempt to provide live database parameters, SDKs, or credentials
    if (
      options.productionDatabaseUrl ||
      options.firebaseConfig ||
      options.serviceAccount ||
      options.emulatorHost ||
      options.databaseUrl ||
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST
    ) {
      throw new Error(
        'SECURITY_VIOLATION: Live database parameters, credentials, emulator endpoints, or SDKs ' +
        'are strictly prohibited in TransactionalResetOrchestrator.'
      );
    }

    // Safety Guard 2: Permanent execution lock — dryRun is unconditionally true
    this.dryRun = true;
    this.executionLocked = true;
    this.maintenanceLocked = false;
    this.journal = [];
    this.manifest = null;
    this.auditLog = [];
  }

  log(msg, level = 'info') {
    const entry = { timestamp: new Date().toISOString(), level, message: msg };
    this.auditLog.push(entry);
  }

  /**
   * Phase 1: Environment & Network Quarantine Guard
   * Enforced across all public entry points
   */
  assertQuarantine(store) {
    if (!store || typeof store !== 'object') {
      throw new Error('QUARANTINE_ERROR: Missing data store.');
    }
    if (store.isSynthetic !== true) {
      throw new Error('QUARANTINE_ERROR: Data store is not explicitly marked as synthetic (store.isSynthetic !== true). Execution refused.');
    }
    // Verify no live network sockets or database handles
    if (store.collection && typeof store.collection === 'function' && !store.collections) {
      throw new Error('QUARANTINE_ERROR: Live Firestore SDK detected. Execution refused.');
    }
    this.log('Phase 1: Environment & Quarantine Guard PASSED (100% synthetic in-memory store confirmed)');
    return true;
  }

  /**
   * Authoritative Source Archive Identity Validation & Construction (STEP 33.144)
   *
   * Validates raw bytes, computes raw file SHA-256, verifies export structure,
   * validates timestamp/snapshot identity (no fabrication), asserts expected collection coverage,
   * and verifies canonical cryptographic payload hash.
   */
  static validateAndBuildSourceIdentity(params = {}) {
    if (!params || typeof params !== 'object') {
      throw new Error('SOURCE_IDENTITY_ERROR: Parameters object is required.');
    }

    // Gate 2 Requirement 1: Compute source file SHA-256 from actual input bytes.
    if (!params.rawBytes || (typeof params.rawBytes !== 'string' && !Buffer.isBuffer(params.rawBytes))) {
      throw new Error(
        'SOURCE_IDENTITY_ERROR: Raw input bytes are required to compute source archive SHA-256. ' +
        'Caller-provided hashes cannot be trusted without independent byte verification.'
      );
    }

    const rawBuf = Buffer.isBuffer(params.rawBytes) ? params.rawBytes : Buffer.from(params.rawBytes, 'utf8');
    const computedFileSha256 = crypto.createHash('sha256').update(rawBuf).digest('hex').toUpperCase();

    // Verify caller-provided hash if supplied
    if (params.expectedSourceFileSha256 !== undefined && params.expectedSourceFileSha256 !== null) {
      const expectedFileHash = String(params.expectedSourceFileSha256).trim().toUpperCase();
      if (computedFileSha256 !== expectedFileHash) {
        throw new Error(
          `SOURCE_IDENTITY_ERROR: Caller-provided source file SHA-256 mismatch. ` +
          `Expected ${expectedFileHash} but computed ${computedFileSha256}. Untrusted source rejected.`
        );
      }
    }

    // Gate 3: Parse rawBytes using the same strict JSON parsing path used by CLI
    let parsedFromBytes;
    try {
      parsedFromBytes = JSON.parse(rawBuf.toString('utf8'));
    } catch (err) {
      throw new Error(`SOURCE_IDENTITY_ERROR: Source export file is not valid JSON: ${err.message}`);
    }
    if (!parsedFromBytes || typeof parsedFromBytes !== 'object') {
      throw new Error('SOURCE_IDENTITY_ERROR: Backup content is not an object.');
    }

    // Gate 3: If caller supplied backupObj, verify that backupObj represents exactly the parsed source data
    // using documented, deterministic comparison (canonicalJsonStringify)
    let backupObj = parsedFromBytes;
    if (params.backupObj !== undefined && params.backupObj !== null) {
      if (typeof params.backupObj !== 'object') {
        throw new Error('SOURCE_IDENTITY_ERROR: Caller-supplied backupObj must be an object.');
      }
      const parsedCanon = canonicalJsonStringify(parsedFromBytes);
      const backupCanon = canonicalJsonStringify(params.backupObj);
      if (parsedCanon !== backupCanon) {
        throw new Error(
          'SOURCE_IDENTITY_ERROR: Input mismatch: caller-supplied backupObj does not match parsed rawBytes. ' +
          'Binding file SHA-256 to a different data object is strictly prohibited.'
        );
      }
      backupObj = parsedFromBytes;
    }

    // Gate 2 Requirement 2: Do not silently fabricate timestamp, snapshot ID, or complete coverage.
    const meta = backupObj.metadata;
    if (!meta || typeof meta !== 'object') {
      throw new Error('SOURCE_IDENTITY_ERROR: Backup metadata object is missing.');
    }

    const rawTimestamp = meta.exportedAt || meta.timestamp || meta.exportTimestamp;
    const rawSnapshotId = meta.snapshotId || meta.snapshotIdentifier || meta.backupVersion;

    let validatedTimestamp = null;
    let validatedSnapshotId = null;

    if (rawTimestamp !== undefined && rawTimestamp !== null) {
      if (typeof rawTimestamp === 'string' && rawTimestamp.trim() !== '' && !isNaN(Date.parse(rawTimestamp))) {
        validatedTimestamp = new Date(rawTimestamp).toISOString();
      } else if (typeof rawTimestamp === 'number' && rawTimestamp > 0 && isFinite(rawTimestamp)) {
        validatedTimestamp = new Date(rawTimestamp).toISOString();
      } else {
        throw new Error(`SOURCE_IDENTITY_ERROR: Malformed source export timestamp: '${rawTimestamp}'. Must be valid ISO-8601 date or epoch.`);
      }
    }

    if (rawSnapshotId !== undefined && rawSnapshotId !== null) {
      const snapStr = String(rawSnapshotId).trim();
      if (snapStr.length > 0 && /^[A-Za-z0-9_.:-]+$/.test(snapStr)) {
        validatedSnapshotId = snapStr;
      } else {
        throw new Error(`SOURCE_IDENTITY_ERROR: Malformed source snapshot identifier: '${rawSnapshotId}'.`);
      }
    }

    // Gate 2 Requirement 3: If input cannot establish required identity or coverage, fail closed.
    if (!validatedTimestamp && !validatedSnapshotId) {
      throw new Error(
        'SOURCE_IDENTITY_ERROR: Export source lacks verifiable timestamp or snapshot identifier. ' +
        'Silent fabrication of snapshot metadata is strictly prohibited.'
      );
    }

    // Collection coverage validation
    const requiredCollections = (
      params.expectedCollectionCoverage?.requiredCollections ||
      REQUIRED_BACKUP_COLLECTIONS
    ).slice().sort();

    const documentedExclusions = (
      params.expectedCollectionCoverage?.documentedExclusions ||
      DOCUMENTED_BACKUP_EXCLUSIONS
    ).slice().sort();

    if (!backupObj.collections || typeof backupObj.collections !== 'object') {
      throw new Error('BACKUP_VERIFICATION_ERROR: Missing collections payload in backup.');
    }

    for (const rc of requiredCollections) {
      if (!backupObj.collections[rc] || !Array.isArray(backupObj.collections[rc])) {
        throw new Error(`BACKUP_VERIFICATION_ERROR: Required collection '${rc}' missing from backup export.`);
      }
    }

    const presentCollections = Object.keys(backupObj.collections).sort();

    // Authoritative backup integrity verification
    if (meta.source !== 'firestore') {
      throw new Error("BACKUP_VERIFICATION_ERROR: Backup metadata invalid or source is not 'firestore'.");
    }

    const integrityMeta = meta.integrity || (meta.sha256 ? { hash: meta.sha256 } : null);
    const requireIntegrityHash = params.requireIntegrityHash !== false; // defaults to true for authoritative preflight

    if (!integrityMeta || !integrityMeta.hash) {
      if (requireIntegrityHash) {
        throw new Error('BACKUP_VERIFICATION_ERROR: Missing required cryptographic integrity hash in backup metadata.');
      }
    }

    let canonicalPayloadHash = null;
    let verifiedExpectedHash = null;

    if (integrityMeta && integrityMeta.hash) {
      const expectedHash = String(integrityMeta.hash).trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(expectedHash)) {
        throw new Error(`BACKUP_VERIFICATION_ERROR: Malformed integrity hash '${integrityMeta.hash}'. Expected 64-character hex string.`);
      }

      const payload = {
        collections: backupObj.collections || {},
        counters: backupObj.counters || null,
        reservations: backupObj.reservations || [],
        idempotency: backupObj.idempotency || [],
        system: backupObj.system || {}
      };
      canonicalPayloadHash = computeSha256(canonicalJsonStringify(payload));
      if (canonicalPayloadHash !== expectedHash) {
        throw new Error(`BACKUP_INTEGRITY_MISMATCH: Computed hash ${canonicalPayloadHash} does not match expected hash ${expectedHash}`);
      }
      verifiedExpectedHash = expectedHash;
    }

    // Gate 2 Requirement 4 & 5: Strict deterministic source identity model distinguishing file integrity from completeness
    const sourceIdentity = {
      sourceFileSha256: computedFileSha256,
      sourceFilePath: params.filePath ? path.resolve(String(params.filePath)) : 'in-memory',
      sourceExportTimestamp: validatedTimestamp,
      snapshotId: validatedSnapshotId,
      expectedCoverage: {
        requiredCollections,
        documentedExclusions,
        presentCollections
      },
      integrityVerification: {
        verified: true,
        canonicalPayloadHash,
        expectedHash: verifiedExpectedHash,
        algorithm: 'SHA-256'
      },
      fileIntegrityVerified: true,
      exportCompletenessProof: false, // Explicitly false! File SHA-256 does NOT prove database completeness
      completenessNotice: 'Matching file SHA-256 confirms raw byte integrity against tampering; it does not prove the export contains all live subcollections, unindexed documents, or external Auth state.',
      verifiedAt: new Date().toISOString()
    };

    // Register into module-private verification registry (Gate 2 Requirement 1, 2, 3)
    trustedSourceIdentities.add(sourceIdentity);
    trustedSourceIdentityData.set(sourceIdentity, {
      canonicalPayloadHash,
      sourceFileSha256: computedFileSha256,
      expectedCoverage: {
        requiredCollections,
        documentedExclusions,
        presentCollections
      },
      snapshotId: validatedSnapshotId,
      sourceExportTimestamp: validatedTimestamp,
      verifiedAt: sourceIdentity.verifiedAt
    });

    if (params.store && typeof params.store === 'object') {
      try {
        bindSourceIdentityToStore(params.store, sourceIdentity);
      } catch (e) {
        // Leave unbound if mismatch
      }
    }

    return sourceIdentity;
  }

  validateAndBuildSourceIdentity(params = {}) {
    return TransactionalResetOrchestrator.validateAndBuildSourceIdentity(params);
  }

  /**
   * Phase 2: Authoritative Backup Ingestion & Cryptographic Verification
   */
  verifyBackupIntegrity(backupObj, options = {}) {
    if (!backupObj || typeof backupObj !== 'object') {
      throw new Error('BACKUP_VERIFICATION_ERROR: Backup object is missing or invalid.');
    }
    const meta = backupObj.metadata;
    if (!meta || meta.source !== 'firestore') {
      throw new Error('BACKUP_VERIFICATION_ERROR: Backup metadata invalid or source is not firestore.');
    }

    // Required collections in application backup export
    const requiredCollections = options.requiredCollections || REQUIRED_BACKUP_COLLECTIONS;

    if (!backupObj.collections) {
      throw new Error('BACKUP_VERIFICATION_ERROR: Missing collections payload in backup.');
    }

    for (const rc of requiredCollections) {
      if (!backupObj.collections[rc] || !Array.isArray(backupObj.collections[rc])) {
        throw new Error(`BACKUP_VERIFICATION_ERROR: Required collection '${rc}' missing from backup export.`);
      }
    }

    // Verify SHA-256 integrity hash if present
    const integrityMeta = meta.integrity || (meta.sha256 ? { hash: meta.sha256 } : null);
    if (integrityMeta && integrityMeta.hash) {
      const expectedHash = String(integrityMeta.hash).trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(expectedHash)) {
        throw new Error(`BACKUP_VERIFICATION_ERROR: Malformed integrity hash '${integrityMeta.hash}'. Expected 64-character hex string.`);
      }
      const payload = {
        collections: backupObj.collections || {},
        counters: backupObj.counters || null,
        reservations: backupObj.reservations || [],
        idempotency: backupObj.idempotency || [],
        system: backupObj.system || {}
      };
      const computedHash = computeSha256(canonicalJsonStringify(payload));
      if (computedHash !== expectedHash) {
        throw new Error(`BACKUP_INTEGRITY_MISMATCH: Computed hash ${computedHash} does not match expected hash ${expectedHash}`);
      }
      this.log(`Phase 2: Authoritative Backup cryptographic integrity verified (${computedHash})`);
    } else {
      if (options.requireIntegrityHash) {
        throw new Error('BACKUP_VERIFICATION_ERROR: Missing required cryptographic integrity hash in backup metadata.');
      }
      this.log('Phase 2: Backup schema verified (no integrity hash present)');
    }

    return true;
  }

  /**
   * Phase 3: Manifest Generation & Reciprocal Linkage Audit
   */
  generateManifest(store, options = {}) {
    this.assertQuarantine(store);

    const manifest = {
      createdAt: new Date().toISOString(),
      sourceIdentity: null,
      targetRecords: [],
      preservedRecords: [],
      quarantinedRecords: [],
      unresolvedNestedRecords: [],
      integrityFailures: [],
      counts: {},
      topologicalBatches: [],
      relationshipEdges: []
    };

    const candidateIdentity = options.sourceIdentity || store.sourceIdentity || null;

    let sourceIdentityValid = false;
    let sourceIdentityStatus = 'UNVERIFIED';
    let sourceIdentityReason = '';

    if (!candidateIdentity) {
      sourceIdentityStatus = 'UNVERIFIED';
      sourceIdentityReason = 'Direct manifest generation without validated source archive identity.';
      manifest.integrityFailures.push(
        'SOURCE_IDENTITY_ERROR: Direct manifest generation without validated source identity is strictly ineligible for reset.'
      );
      this.log('Phase 2.5: Source Identity UNVERIFIED: Direct store inspection without backup preflight.', 'warn');
    } else if (typeof candidateIdentity !== 'object' || !trustedSourceIdentities.has(candidateIdentity)) {
      sourceIdentityStatus = 'FABRICATED_OR_UNVERIFIED';
      sourceIdentityReason = 'Caller-provided source identity was not produced by trusted validation path or is caller-fabricated.';
      manifest.integrityFailures.push(
        'SOURCE_IDENTITY_ERROR: Caller-provided source identity was not produced by trusted validation path. Eligibility refused.'
      );
      this.log('Phase 2.5: Untrusted source identity rejected: fabricated or unverified object.', 'warn');
    } else {
      const boundStore = identityStoreBindings.get(candidateIdentity);
      if (boundStore && boundStore !== store) {
        sourceIdentityStatus = 'IDENTITY_STORE_MISMATCH';
        sourceIdentityReason = 'Genuine source identity is bound to a different store instance. Cross-store authorization is prohibited.';
        manifest.integrityFailures.push(
          'SOURCE_IDENTITY_ERROR: Genuine source identity is bound to a different store instance. Cross-store authorization is prohibited.'
        );
        this.log('Phase 2.5: Cross-store identity reuse rejected.', 'warn');
      } else {
        if (!boundStore) {
          try {
            bindSourceIdentityToStore(store, candidateIdentity);
          } catch (bindErr) {
            sourceIdentityStatus = 'BINDING_ERROR';
            sourceIdentityReason = bindErr.message;
            manifest.integrityFailures.push(bindErr.message);
          }
        }

        const binding = storeValidationBindings.get(store);
        if (!binding || binding.boundIdentity !== candidateIdentity) {
          sourceIdentityStatus = 'STORE_CONTENT_MISMATCH';
          sourceIdentityReason = 'Store contents do not match canonical payload of verified source identity.';
          manifest.integrityFailures.push(
            'SOURCE_IDENTITY_ERROR: Store content payload hash does not match verified source payload hash.'
          );
          this.log('Phase 2.5: Store contents do not match verified source payload hash.', 'warn');
        } else {
          const currentFingerprint = computeStoreFingerprint(store);
          const currentCols = store.listCollections ? store.listCollections().slice().sort() : [];
          const colsUnchanged = binding.validatedCollections &&
            currentCols.length === binding.validatedCollections.length &&
            currentCols.every((col, idx) => col === binding.validatedCollections[idx]);

          if (binding.mutationCount !== store.mutationCount || currentFingerprint !== binding.storeFingerprint) {
            sourceIdentityStatus = 'STALE_OR_MUTATED';
            sourceIdentityReason = 'Store content was mutated after source identity validation. Stale identity rejected.';
            manifest.integrityFailures.push(
              'SOURCE_IDENTITY_ERROR: Store content was mutated after identity validation. Stale identity rejected.'
            );
            this.log('Phase 2.5: Store mutation detected after identity validation.', 'warn');
          } else if (!colsUnchanged) {
            sourceIdentityStatus = 'COVERAGE_MUTATED';
            sourceIdentityReason = 'Store collection coverage was mutated after source identity validation.';
            manifest.integrityFailures.push(
              'SOURCE_IDENTITY_ERROR: Store collection coverage was mutated after validation.'
            );
            this.log('Phase 2.5: Store collection coverage mutated after identity validation.', 'warn');
          } else {
            const presentCols = candidateIdentity.expectedCoverage?.presentCollections;
            const currentPayload = extractStorePayload(store, presentCols);
            const currentPayloadHash = computeSha256(canonicalJsonStringify(currentPayload));

            if (currentPayloadHash !== candidateIdentity.integrityVerification?.canonicalPayloadHash) {
              sourceIdentityStatus = 'PAYLOAD_HASH_MISMATCH';
              sourceIdentityReason = `Recomputed store payload hash does not match verified source hash.`;
              manifest.integrityFailures.push(
                `SOURCE_IDENTITY_ERROR: Recomputed store payload hash (${currentPayloadHash}) does not match verified source hash.`
              );
              this.log('Phase 2.5: Recomputed store payload hash mismatch.', 'warn');
            } else {
              const expectedReq = candidateIdentity.expectedCoverage?.requiredCollections || REQUIRED_BACKUP_COLLECTIONS;
              const storeCols = store.listCollections();
              let coverageOk = true;
              for (const reqCol of expectedReq) {
                if (!storeCols.includes(reqCol)) {
                  coverageOk = false;
                  sourceIdentityStatus = 'COVERAGE_MISMATCH';
                  sourceIdentityReason = `Store is missing required collection '${reqCol}' verified in source identity.`;
                  manifest.integrityFailures.push(
                    `SOURCE_IDENTITY_ERROR: Store missing required collection '${reqCol}'.`
                  );
                  break;
                }
              }

              if (coverageOk && candidateIdentity.expectedCoverage?.presentCollections) {
                const allowedPres = new Set([
                  ...candidateIdentity.expectedCoverage.presentCollections,
                  ...PROTECTED_COLLECTIONS,
                  ...DOCUMENTED_BACKUP_EXCLUSIONS,
                  'system',
                  'migration_staging',
                  '__system_diagnostics__'
                ]);
                for (const c of storeCols) {
                  if (!allowedPres.has(c)) {
                    coverageOk = false;
                    sourceIdentityStatus = 'COVERAGE_MUTATED';
                    sourceIdentityReason = `Store contains unexpected collection '${c}' not verified in source identity or protected schema.`;
                    manifest.integrityFailures.push(
                      `SOURCE_IDENTITY_ERROR: Store contains unexpected collection '${c}'.`
                    );
                    break;
                  }
                }
              }

              if (coverageOk) {
                sourceIdentityValid = true;
                sourceIdentityStatus = 'VERIFIED';
                this.log(`Phase 2.5: Validated Source Archive Identity bound to manifest (${candidateIdentity.sourceFileSha256})`);
              }
            }
          }
        }
      }
    }

    if (sourceIdentityValid) {
      manifest.sourceIdentity = candidateIdentity;
    } else {
      manifest.sourceIdentity = {
        status: sourceIdentityStatus,
        verified: false,
        fileIntegrityVerified: false,
        sourceFileSha256: (candidateIdentity && candidateIdentity.sourceFileSha256) || null,
        sourceExportTimestamp: (candidateIdentity && candidateIdentity.sourceExportTimestamp) || null,
        snapshotId: (candidateIdentity && candidateIdentity.snapshotId) || null,
        expectedCoverage: null,
        reason: sourceIdentityReason
      };
    }

    // Check for durable journal interruption in store
    const existingJournal = store.get('system', '_resetJournal');
    if (existingJournal && (existingJournal.status === 'IN_PROGRESS' || existingJournal.status === 'INTERRUPTED')) {
      manifest.quarantinedRecords.push({
        collection: 'system',
        id: '_resetJournal',
        reason: 'INTERRUPTED_RESET_IN_PROGRESS'
      });
      this.log(`Interrupted reset journal detected in store. Status: ${existingJournal.status}`, 'error');
    }

    const allCollections = store.listCollections();

    // Check each collection
    for (const colName of allCollections) {
      const docs = store.list(colName);

      // Check if this collection is protected master data
      if (PROTECTED_COLLECTIONS.includes(colName)) {
        for (const doc of docs) {
          manifest.preservedRecords.push({
            collection: colName,
            id: doc._firestoreId || String(doc.id),
            reason: 'PROTECTED_MASTER_DATA'
          });
        }
        continue;
      }

      // Check system collection
      if (colName === 'system') {
        for (const doc of docs) {
          const docId = doc._firestoreId || String(doc.id);

          // Protected system docs
          if (PROTECTED_SYSTEM_DOCS.includes(docId)) {
            manifest.preservedRecords.push({
              collection: 'system',
              id: docId,
              reason: 'PROTECTED_SYSTEM_METADATA'
            });
            continue;
          }

          // Physical reservations and physical idempotency records MUST be preserved
          if (docId.startsWith('res_phys_') || docId.startsWith('op_phys_')) {
            manifest.preservedRecords.push({
              collection: 'system',
              id: docId,
              reason: 'PROTECTED_PHYSICAL_RECEIPT_TRACKING'
            });
            continue;
          }

          // Software sequence reservations (res_N)
          if (/^res_[0-9]+$/.test(docId)) {
            const seq = Number(doc.seqNumber);
            if (isNaN(seq) || seq <= 0) {
              manifest.quarantinedRecords.push({
                collection: 'system',
                id: docId,
                reason: 'MALFORMED_RESERVATION_PAYLOAD'
              });
              continue;
            }
            manifest.targetRecords.push({
              collection: 'system',
              id: docId,
              type: 'software_reservation',
              seqNumber: seq,
              billDocId: doc.billDocId,
              receiptDocId: doc.receiptDocId,
              operationId: doc.operationId,
              docSha256: computeSha256(canonicalJsonStringify(doc))
            });
            continue;
          }

          // Software idempotency records (op_*)
          if (/^op_[A-Za-z0-9_-]+$/.test(docId)) {
            manifest.targetRecords.push({
              collection: 'system',
              id: docId,
              type: 'software_idempotency',
              operationId: doc.operationId || docId,
              seqNumber: doc.seqNumber,
              resDocId: doc.resDocId,
              billDocId: doc.billDocId,
              receiptDocId: doc.receiptDocId,
              docSha256: computeSha256(canonicalJsonStringify(doc))
            });
            continue;
          }

          // Unclassified system record -> quarantine
          manifest.quarantinedRecords.push({
            collection: 'system',
            id: docId,
            reason: 'UNCLASSIFIED_SYSTEM_RECORD'
          });
        }
        continue;
      }

      // Check if target transaction collection
      const targetConfig = ALLOWED_TRANSACTION_COLLECTIONS[colName];
      if (targetConfig) {
        for (const doc of docs) {
          const docId = doc._firestoreId || String(doc.id);
          // Check physical receipt preservation in receipts collection
          if (
            colName === 'receipts' &&
            (String(docId).startsWith('rcpt_phys_') ||
              doc.source === 'physical' ||
              doc.isPhysical === true ||
              doc.physicalType !== undefined ||
              (typeof doc.receiptNo === 'string' && /^(P[0-9]+|PU[0-9]+)$/.test(doc.receiptNo.trim().toUpperCase())))
          ) {
            manifest.preservedRecords.push({
              collection: 'receipts',
              id: docId,
              reason: 'PROTECTED_PHYSICAL_RECEIPT'
            });
            continue;
          }

          // Step 33.142: Migration staging nested subcollections detection
          if (colName === 'migration_staging') {
            const hasNested = !!(
              doc.hasSubcollections === true ||
              doc.subcollections ||
              doc.storeWriteResults ||
              (doc.storesCount !== undefined && Number(doc.storesCount) > 0) ||
              (doc.totalRecords !== undefined && Number(doc.totalRecords) > 0) ||
              (doc.totalWritten !== undefined && Number(doc.totalWritten) > 0)
            );
            if (hasNested) {
              manifest.unresolvedNestedRecords.push({
                collection: 'migration_staging',
                id: docId,
                reason: 'UNRESOLVED_NESTED_SUBCOLLECTIONS',
                details: `Migration staging root '${docId}' contains hierarchical subcollections which cannot be safely deleted by flat deletion.`
              });
              manifest.quarantinedRecords.push({
                collection: 'migration_staging',
                id: docId,
                reason: 'UNRESOLVED_NESTED_SUBCOLLECTIONS'
              });
              continue;
            }
          }

          // Subledger & Target Schema Validation
          const idMatches = targetConfig.idRegex ? targetConfig.idRegex.test(docId) : true;
          const payloadValid = targetConfig.matcher(doc);

          if (idMatches && payloadValid) {
            manifest.targetRecords.push({
              collection: colName,
              id: docId,
              type: colName,
              docSha256: computeSha256(canonicalJsonStringify(doc)),
              dataSummary: {
                receiptNo: doc.receiptNo || doc.voucherNo,
                amount: doc.totalAmount !== undefined ? doc.totalAmount : (doc.amountReceived !== undefined ? doc.amountReceived : (doc.loanReceived !== undefined ? doc.loanReceived : (doc.repayment !== undefined ? doc.repayment : (doc.amount !== undefined ? doc.amount : doc.principalAmount)))),
                accountingReceiptId: doc.accountingReceiptId,
                billingId: doc.billingId,
                reservationDocId: doc.reservationDocId,
                person: doc.person || doc.borrowerName,
                fromAcc: doc.fromAcc || doc.fromAccount,
                toAcc: doc.toAcc || doc.toAccount,
                category: doc.category || doc.expenseCategory
              }
            });
          } else if (idMatches && !payloadValid) {
            manifest.quarantinedRecords.push({
              collection: colName,
              id: docId,
              reason: 'MALFORMED_SUBLEDGER_PAYLOAD'
            });
          } else {
            manifest.quarantinedRecords.push({
              collection: colName,
              id: docId,
              reason: 'DOC_ID_MATCHER_REJECTED'
            });
          }
        }
        continue;
      }

      // If we reach here, collection is completely unknown -> quarantine all records
      for (const doc of docs) {
        manifest.quarantinedRecords.push({
          collection: colName,
          id: doc._firestoreId || String(doc.id),
          reason: 'UNKNOWN_COLLECTION'
        });
      }
    }

    // Phase 3B: Cross-Reference & Linkage Audit (Strictly Bidirectional & Sequence-Verified)
    const linkageErrors = [];
    const verifiedEdges = [];

    if (existingJournal && (existingJournal.status === 'IN_PROGRESS' || existingJournal.status === 'INTERRUPTED')) {
      linkageErrors.push(
        `Interrupted Execution Detected: Prior reset halted at stage ${existingJournal.currentStage} ` +
        `(${existingJournal.error || 'uncommitted batch'}). Multi-batch deletion is non-atomic and cannot be safely resumed. ` +
        `Restore the pre-reset authoritative backup.`
      );
    }

    // Map bills, receipts, reservations, and idempotency records
    const bills = manifest.targetRecords.filter(r => r.collection === 'billing');
    const receipts = manifest.targetRecords.filter(r => r.collection === 'receipts');
    const reservations = manifest.targetRecords.filter(r => r.collection === 'system' && r.type === 'software_reservation');
    const idempotency = manifest.targetRecords.filter(r => r.collection === 'system' && r.type === 'software_idempotency');

    const receiptMap = new Map(receipts.map(r => [r.id, r]));
    const billMap = new Map(bills.map(b => [b.id, b]));
    const resMap = new Map(reservations.map(res => [res.id, res]));
    const opMap = new Map(idempotency.map(op => [op.id, op]));

    // 1. Audit Bills: Forward & Reverse to Receipts, Reservations, and Operations
    for (const b of bills) {
      const rawBill = store.get('billing', b.id);

      // 1a. Bill -> Receipt validation
      const linkedRcptId = rawBill.accountingReceiptId || (rawBill.id ? `rcpt_${rawBill.id}` : null);
      if (!linkedRcptId || !receiptMap.has(linkedRcptId)) {
        linkageErrors.push(`Broken Linkage: Bill '${b.id}' points to missing or non-target receipt '${linkedRcptId}'`);
      } else {
        const rawRcpt = store.get('receipts', linkedRcptId);
        const rcptBillId = rawRcpt.billingFirestoreId || (rawRcpt.billingId ? `bill_${rawRcpt.billingId}` : null);
        if (rcptBillId !== b.id) {
          linkageErrors.push(`Conflicting Reciprocal Linkage: Bill '${b.id}' points to receipt '${linkedRcptId}', but receipt points to '${rcptBillId}'`);
        } else {
          verifiedEdges.push(`billing/${b.id} <-> receipts/${linkedRcptId}`);
        }
      }

      // 1b. Bill -> Reservation validation (Bidirectional: checks missing reservation)
      const linkedResId = rawBill.reservationDocId || (rawBill.id ? `res_${rawBill.id}` : null);
      if (!linkedResId || !resMap.has(linkedResId)) {
        linkageErrors.push(`Missing Reservation: Bill '${b.id}' points to missing or un-targeted reservation '${linkedResId}'`);
      } else {
        const rawRes = store.get('system', linkedResId);
        if (rawRes.billDocId !== b.id) {
          linkageErrors.push(`Conflicting Reciprocal Linkage: Bill '${b.id}' points to reservation '${linkedResId}', but reservation links to bill '${rawRes.billDocId}'`);
        } else {
          verifiedEdges.push(`billing/${b.id} <-> system/${linkedResId}`);
        }
        if (rawBill.id !== undefined && rawRes.seqNumber !== undefined && Number(rawBill.id) !== Number(rawRes.seqNumber)) {
          linkageErrors.push(`Sequence Mismatch: Bill '${b.id}' sequence '${rawBill.id}' does not match reservation sequence '${rawRes.seqNumber}'`);
        }
      }

      // 1c. Bill -> Operation validation
      if (rawBill.operationId) {
        if (!opMap.has(rawBill.operationId)) {
          linkageErrors.push(`Missing Operation Document: Bill '${b.id}' references missing or un-targeted operation '${rawBill.operationId}'`);
        } else {
          const rawOp = store.get('system', rawBill.operationId);
          if (rawOp.billDocId && rawOp.billDocId !== b.id) {
            linkageErrors.push(`Conflicting Operation Reference: Bill '${b.id}' references operation '${rawBill.operationId}', but operation links to bill '${rawOp.billDocId}'`);
          } else {
            verifiedEdges.push(`billing/${b.id} <-> system/${rawBill.operationId}`);
          }
        }
      }
    }

    // 2. Audit Receipts: Forward & Reverse to Bills, Reservations, and Operations
    for (const r of receipts) {
      const rawRcpt = store.get('receipts', r.id);

      // 2a. Receipt -> Bill validation (for billing-linked receipts)
      const isBillingLinked = rawRcpt.source === 'billing' || !!rawRcpt.billingFirestoreId || (rawRcpt.billingId !== undefined && rawRcpt.billingId !== null);
      if (isBillingLinked) {
        const linkedBillId = rawRcpt.billingFirestoreId || (rawRcpt.billingId ? `bill_${rawRcpt.billingId}` : null);
        if (!linkedBillId || !billMap.has(linkedBillId)) {
          linkageErrors.push(`Broken Linkage: Receipt '${r.id}' points to missing or non-target bill '${linkedBillId}'`);
        } else {
          const rawBill = store.get('billing', linkedBillId);
          const billRcptId = rawBill.accountingReceiptId || (rawBill.id ? `rcpt_${rawBill.id}` : null);
          if (billRcptId !== r.id) {
            linkageErrors.push(`Conflicting Reciprocal Linkage: Receipt '${r.id}' points to bill '${linkedBillId}', but bill points to receipt '${billRcptId}'`);
          }
        }
      } else {
        // Independent software receipt: ensure no billing linkages are present
        if (rawRcpt.billingFirestoreId || (rawRcpt.billingId !== undefined && rawRcpt.billingId !== null) || rawRcpt.billingReceiptNo) {
          linkageErrors.push(`Conflicting Billing Linkage: Independent receipt '${r.id}' contains billing linkage references`);
        }
      }

      // 2b. Receipt -> Reservation validation (Bidirectional: checks missing reservation)
      const linkedResId = rawRcpt.reservationDocId || (rawRcpt.id ? `res_${rawRcpt.id}` : null);
      if (!linkedResId || !resMap.has(linkedResId)) {
        linkageErrors.push(`Missing Reservation: Receipt '${r.id}' points to missing or un-targeted reservation '${linkedResId}'`);
      } else {
        const rawRes = store.get('system', linkedResId);
        if (rawRes.receiptDocId !== r.id) {
          linkageErrors.push(`Conflicting Reciprocal Linkage: Receipt '${r.id}' points to reservation '${linkedResId}', but reservation links to receipt '${rawRes.receiptDocId}'`);
        } else {
          verifiedEdges.push(`receipts/${r.id} <-> system/${linkedResId}`);
        }
        if (rawRcpt.id !== undefined && rawRes.seqNumber !== undefined && Number(rawRcpt.id) !== Number(rawRes.seqNumber)) {
          linkageErrors.push(`Sequence Mismatch: Receipt '${r.id}' sequence '${rawRcpt.id}' does not match reservation sequence '${rawRes.seqNumber}'`);
        }
      }

      // 2c. Receipt -> Operation validation
      if (rawRcpt.operationId) {
        if (!opMap.has(rawRcpt.operationId)) {
          linkageErrors.push(`Missing Operation Document: Receipt '${r.id}' references missing or un-targeted operation '${rawRcpt.operationId}'`);
        } else {
          const rawOp = store.get('system', rawRcpt.operationId);
          if (rawOp.receiptDocId && rawOp.receiptDocId !== r.id) {
            linkageErrors.push(`Conflicting Operation Reference: Receipt '${r.id}' references operation '${rawRcpt.operationId}', but operation links to receipt '${rawOp.receiptDocId}'`);
          } else {
            verifiedEdges.push(`receipts/${r.id} <-> system/${rawRcpt.operationId}`);
          }
        }
      }
    }

    // 3. Audit Reservations: Forward & Reciprocal to Bills, Receipts, and Operations
    for (const res of reservations) {
      const rawRes = store.get('system', res.id);

      // 3a. Forward links to Bills and Receipts
      if (rawRes.billDocId && !billMap.has(rawRes.billDocId)) {
        linkageErrors.push(`Orphaned Software Reservation: '${res.id}' links to non-existent or un-targeted bill '${rawRes.billDocId}'`);
      }
      if (rawRes.receiptDocId && !receiptMap.has(rawRes.receiptDocId)) {
        linkageErrors.push(`Orphaned Software Reservation: '${res.id}' links to non-existent or un-targeted receipt '${rawRes.receiptDocId}'`);
      }
      if (rawRes.type === 'independent_receipt' && rawRes.billDocId) {
        linkageErrors.push(`Conflicting Reservation Linkage: Independent receipt reservation '${res.id}' must not have billDocId '${rawRes.billDocId}'`);
      }

      // 3b. Reservation -> Operation validation
      if (rawRes.operationId !== undefined && rawRes.operationId !== null) {
        if (typeof rawRes.operationId !== 'string' || !/^op_[A-Za-z0-9_-]+$/.test(rawRes.operationId) || rawRes.operationId.trim() === '') {
          linkageErrors.push(`Malformed Operation Identifier: Software reservation '${res.id}' has malformed operationId '${rawRes.operationId}'`);
        } else if (!opMap.has(rawRes.operationId)) {
          linkageErrors.push(`Missing Operation Document: Software reservation '${res.id}' references missing or un-targeted operation '${rawRes.operationId}'`);
        } else {
          const rawOp = store.get('system', rawRes.operationId);

          // Reciprocal reservation check
          if (!rawOp.resDocId) {
            linkageErrors.push(`Ambiguous Relationship: Operation '${rawRes.operationId}' referenced by reservation '${res.id}' is missing reciprocal resDocId`);
          } else if (rawOp.resDocId !== res.id) {
            linkageErrors.push(`Conflicting Reciprocal Linkage: Reservation '${res.id}' references operation '${rawRes.operationId}', but operation links to reservation '${rawOp.resDocId}'`);
          } else {
            verifiedEdges.push(`system/${res.id} <-> system/${rawRes.operationId}`);
          }

          // Bill identifier agreement
          const resBillId = rawRes.billDocId || null;
          const opBillId = rawOp.billDocId || (rawOp.billId !== undefined ? `bill_${rawOp.billId}` : null);
          if (resBillId && !opBillId) {
            linkageErrors.push(`Conflicting Identifier Reference: Reservation '${res.id}' has billDocId '${resBillId}', but linked operation '${rawRes.operationId}' has no bill identifier`);
          } else if (!resBillId && opBillId) {
            linkageErrors.push(`Conflicting Identifier Reference: Reservation '${res.id}' has no billDocId, but linked operation '${rawRes.operationId}' has bill identifier '${opBillId}'`);
          } else if (resBillId && opBillId && resBillId !== opBillId) {
            linkageErrors.push(`Conflicting Identifier Reference: Reservation '${res.id}' has billDocId '${resBillId}', but linked operation '${rawRes.operationId}' has bill identifier '${opBillId}'`);
          }

          // Receipt identifier agreement
          const resRcptId = rawRes.receiptDocId || null;
          const opRcptId = rawOp.receiptDocId || (rawOp.receiptId !== undefined ? `rcpt_${rawOp.receiptId}` : null);
          if (resRcptId && opRcptId && resRcptId !== opRcptId) {
            linkageErrors.push(`Conflicting Identifier Reference: Reservation '${res.id}' has receiptDocId '${resRcptId}', but linked operation '${rawRes.operationId}' has receipt identifier '${opRcptId}'`);
          }

          // Sequence number agreement
          if (rawRes.seqNumber !== undefined && rawOp.seqNumber !== undefined && Number(rawRes.seqNumber) !== Number(rawOp.seqNumber)) {
            linkageErrors.push(`Sequence Mismatch: Reservation '${res.id}' sequence '${rawRes.seqNumber}' does not match operation '${rawRes.operationId}' sequence '${rawOp.seqNumber}'`);
          }
        }
      }
    }

    // 4. Audit Idempotency Records: Forward & Reciprocal to Reservations and Bills
    for (const op of idempotency) {
      const rawOp = store.get('system', op.id);

      // Check malformed or missing resDocId
      if (!rawOp.resDocId || typeof rawOp.resDocId !== 'string' || !/^res_[0-9]+$/.test(rawOp.resDocId)) {
        linkageErrors.push(`Malformed Reservation Reference: Idempotency token '${op.id}' has missing or malformed resDocId '${rawOp.resDocId}'`);
      } else if (!resMap.has(rawOp.resDocId)) {
        linkageErrors.push(`Stale Idempotency Token: '${op.id}' references missing or non-target reservation '${rawOp.resDocId}'`);
      } else {
        const linkedRes = store.get('system', rawOp.resDocId);
        if (!linkedRes.operationId) {
          linkageErrors.push(`Ambiguous Relationship: Idempotency token '${op.id}' links to reservation '${rawOp.resDocId}', but reservation has no operationId reference`);
        } else if (linkedRes.operationId !== op.id) {
          linkageErrors.push(`Conflicting Reciprocal Linkage: Idempotency token '${op.id}' links to reservation '${rawOp.resDocId}', but reservation points to operation '${linkedRes.operationId}'`);
        }

        // Bill identifier agreement
        const opBillId = rawOp.billDocId || (rawOp.billId !== undefined ? `bill_${rawOp.billId}` : null);
        const resBillId = linkedRes.billDocId || null;
        if (opBillId && !resBillId) {
          linkageErrors.push(`Conflicting Identifier Reference: Idempotency token '${op.id}' has bill identifier '${opBillId}', but reservation '${rawOp.resDocId}' has no billDocId`);
        } else if (!opBillId && resBillId) {
          linkageErrors.push(`Conflicting Identifier Reference: Idempotency token '${op.id}' has no bill identifier, but reservation '${rawOp.resDocId}' has billDocId '${resBillId}'`);
        } else if (opBillId && resBillId && opBillId !== resBillId) {
          linkageErrors.push(`Conflicting Identifier Reference: Idempotency token '${op.id}' has bill identifier '${opBillId}', but reservation '${rawOp.resDocId}' has billDocId '${resBillId}'`);
        }

        // Receipt identifier agreement
        const opRcptId = rawOp.receiptDocId || (rawOp.receiptId !== undefined ? `rcpt_${rawOp.receiptId}` : null);
        const resRcptId = linkedRes.receiptDocId || null;
        if (opRcptId && resRcptId && opRcptId !== resRcptId) {
          linkageErrors.push(`Conflicting Identifier Reference: Idempotency token '${op.id}' has receipt identifier '${opRcptId}', but reservation '${rawOp.resDocId}' has receiptDocId '${resRcptId}'`);
        }

        // Sequence number agreement
        if (rawOp.seqNumber !== undefined && linkedRes.seqNumber !== undefined && Number(rawOp.seqNumber) !== Number(linkedRes.seqNumber)) {
          linkageErrors.push(`Sequence Mismatch: Idempotency token '${op.id}' sequence '${rawOp.seqNumber}' does not match reservation '${rawOp.resDocId}' sequence '${linkedRes.seqNumber}'`);
        }
      }
    }

    // 5. Audit Chitty Collections and Payouts: verify member references exist without targeting master data
    const memberMap = new Map(store.list('chittyMembers').map(m => [String(m.id || m._firestoreId), m]));
    for (const cc of manifest.targetRecords.filter(r => r.collection === 'chittyCollections')) {
      const rawCc = store.get('chittyCollections', cc.id);
      if (rawCc && rawCc.memberId !== undefined && rawCc.memberId !== null) {
        const memId = String(rawCc.memberId);
        const memDocId = memId.startsWith('cm_') ? memId : `cm_${memId}`;
        const hasMember = memberMap.has(memId) || memberMap.has(memDocId) || store.get('chittyMembers', memId) || store.get('chittyMembers', memDocId);
        if (!hasMember) {
          linkageErrors.push(`Broken Reference: Chitty collection '${cc.id}' references non-existent memberId '${rawCc.memberId}'`);
        } else {
          verifiedEdges.push(`chittyCollections/${cc.id} -> chittyMembers/${rawCc.memberId}`);
        }
      }
    }
    for (const cp of manifest.targetRecords.filter(r => r.collection === 'chittyPayouts')) {
      const rawCp = store.get('chittyPayouts', cp.id);
      if (rawCp && rawCp.memberId !== undefined && rawCp.memberId !== null) {
        const memId = String(rawCp.memberId);
        const memDocId = memId.startsWith('cm_') ? memId : `cm_${memId}`;
        const hasMember = memberMap.has(memId) || memberMap.has(memDocId) || store.get('chittyMembers', memId) || store.get('chittyMembers', memDocId);
        if (!hasMember) {
          linkageErrors.push(`Broken Reference: Chitty payout '${cp.id}' references non-existent memberId '${rawCp.memberId}'`);
        } else {
          verifiedEdges.push(`chittyPayouts/${cp.id} -> chittyMembers/${rawCp.memberId}`);
        }
      }
    }

    // 6. Report Unresolved Nested Subcollections
    for (const unres of manifest.unresolvedNestedRecords) {
      linkageErrors.push(
        `Unresolved Nested Subcollections: Record '${unres.collection}/${unres.id}' contains nested subcollections. Purge blocked until explicit representation is established.`
      );
    }

    // 7. Verify critical system metadata document integrity (e.g. system/counters)
    const countersDoc = store.get('system', 'counters');
    if (!countersDoc) {
      linkageErrors.push("Integrity Failure: Required system metadata document 'system/counters' is missing from store.");
    }

    manifest.linkageErrors = linkageErrors;
    manifest.relationshipEdges = Array.from(new Set(verifiedEdges)).sort();

    // Phase 4: Enforce strict deny-by-default quarantine
    if (manifest.quarantinedRecords.length > 0) {
      const sample = manifest.quarantinedRecords.slice(0, 3).map(q => `${q.collection}/${q.id} (${q.reason})`).join(', ');
      this.log(`Phase 4: Ambiguity Quarantine triggered: ${manifest.quarantinedRecords.length} record(s) quarantined: ${sample}`, 'warn');
    }

    if (linkageErrors.length > 0) {
      this.log(`Phase 3: Linkage Audit FAILED with ${linkageErrors.length} error(s)`, 'error');
    } else {
      this.log(`Phase 3: Manifest Generation & Linkage Audit PASSED (${manifest.targetRecords.length} target records, 0 linkage errors)`);
    }

    // Stable alphabetical sort by collection/docId for all record lists
    manifest.targetRecords.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    manifest.preservedRecords.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    manifest.quarantinedRecords.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    manifest.unresolvedNestedRecords.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    manifest.linkageErrors.sort();

    // Topological sort into dependency deletion batches
    // Order: 1. staging/diagnostics, 2. subledgers, 3. receipts, 4. billing, 5. reservations/idempotency
    const stage1 = manifest.targetRecords.filter(r => r.collection === 'migration_staging' || r.collection === '__system_diagnostics__');
    const stage2 = manifest.targetRecords.filter(r => ['chittyPayouts', 'chittyCollections', 'loans', 'transfers', 'payments'].includes(r.collection));
    const stage3 = manifest.targetRecords.filter(r => r.collection === 'receipts');
    const stage4 = manifest.targetRecords.filter(r => r.collection === 'billing');
    const stage5 = manifest.targetRecords.filter(r => r.collection === 'system');

    // Ensure records inside each batch are deterministically sorted
    [stage1, stage2, stage3, stage4, stage5].forEach(stageRecords => {
      stageRecords.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    });

    manifest.topologicalBatches = [
      { stage: 1, name: 'Historical & Diagnostics', records: stage1 },
      { stage: 2, name: 'Sub-ledger Financial Transactions', records: stage2 },
      { stage: 3, name: 'Accounting Receipts', records: stage3 },
      { stage: 4, name: 'Vazhipadu Billing Records', records: stage4 },
      { stage: 5, name: 'Software Sequence Reservations & Idempotency Tokens', records: stage5 }
    ];

    // Compute manifest eligibility strictly based on zero quarantine, zero linkage errors,
    // zero unresolved nested records, zero integrity failures, and validated source archive identity
    const isEligible = (
      sourceIdentityValid === true &&
      manifest.quarantinedRecords.length === 0 &&
      manifest.linkageErrors.length === 0 &&
      manifest.unresolvedNestedRecords.length === 0 &&
      (!manifest.integrityFailures || manifest.integrityFailures.length === 0) &&
      (manifest.sourceIdentity && manifest.sourceIdentity.fileIntegrityVerified === true && manifest.sourceIdentity.integrityVerification?.verified === true)
    );
    manifest.eligibleForReset = !!isEligible;

    // Compute manifest digest from stably sorted target records (with content fingerprints),
    // relationship edges, complete preserved records, bound source identity, and safety fields
    const manifestPayload = {
      sourceIdentity: (sourceIdentityValid && manifest.sourceIdentity && manifest.sourceIdentity.fileIntegrityVerified === true) ? {
        sourceFileSha256: manifest.sourceIdentity.sourceFileSha256,
        sourceExportTimestamp: manifest.sourceIdentity.sourceExportTimestamp,
        snapshotId: manifest.sourceIdentity.snapshotId,
        expectedCoverage: {
          requiredCollections: manifest.sourceIdentity.expectedCoverage?.requiredCollections || [],
          documentedExclusions: manifest.sourceIdentity.expectedCoverage?.documentedExclusions || []
        },
        integrityHash: manifest.sourceIdentity.integrityVerification?.canonicalPayloadHash || null,
        fileIntegrityVerified: true
      } : {
        status: manifest.sourceIdentity?.status || 'UNVERIFIED',
        fileIntegrityVerified: false,
        reason: manifest.sourceIdentity?.reason || 'Unverified or invalid source identity.'
      },
      targetRecords: manifest.targetRecords.map(r => ({
        col: r.collection,
        id: r.id,
        type: r.type,
        docSha256: r.docSha256
      })),
      relationshipEdges: manifest.relationshipEdges,
      preservedRecords: manifest.preservedRecords.map(r => ({ col: r.collection, id: r.id, reason: r.reason })),
      quarantinedRecords: manifest.quarantinedRecords.map(r => ({ col: r.collection, id: r.id, reason: r.reason })),
      unresolvedNestedRecords: manifest.unresolvedNestedRecords.map(r => ({ col: r.collection, id: r.id, reason: r.reason })),
      topologicalStages: manifest.topologicalBatches.map(b => ({
        stage: b.stage,
        name: b.name,
        count: b.records.length,
        recordIds: b.records.map(r => `${r.collection}/${r.id}`)
      })),
      eligibleForReset: manifest.eligibleForReset,
      counts: {
        totalTargetRecords: manifest.targetRecords.length,
        totalPreservedRecords: manifest.preservedRecords.length,
        totalQuarantinedRecords: manifest.quarantinedRecords.length,
        totalUnresolvedNestedRecords: manifest.unresolvedNestedRecords.length,
        linkageErrorsCount: manifest.linkageErrors.length
      }
    };
    manifest.manifestHash = computeSha256(canonicalJsonStringify(manifestPayload));

    // Summary counts
    manifest.counts = {
      totalTargetRecords: manifest.targetRecords.length,
      totalPreservedRecords: manifest.preservedRecords.length,
      totalQuarantinedRecords: manifest.quarantinedRecords.length,
      totalUnresolvedNestedRecords: manifest.unresolvedNestedRecords.length,
      linkageErrorsCount: manifest.linkageErrors.length
    };

    this.manifest = manifest;
    return manifest;
  }

  /**
   * Phase 5: Pre-Execution Dry-Run Audit Report
   */
  produceDryRunReport(store, options = {}) {
    this.assertQuarantine(store);
    const manifest = this.generateManifest(store, options);

    const report = {
      dryRun: true,
      executionLocked: true,
      timestamp: new Date().toISOString(),
      manifestHash: manifest.manifestHash,
      eligibleForReset: manifest.eligibleForReset,
      sourceIdentity: manifest.sourceIdentity,
      summaryCounts: manifest.counts,
      topologicalStages: manifest.topologicalBatches.map(b => ({
        stage: b.stage,
        name: b.name,
        count: b.records.length
      })),
      relationshipEdgesCount: manifest.relationshipEdges.length,
      preservedSummary: {
        total: manifest.preservedRecords.length,
        breakdown: manifest.preservedRecords.reduce((acc, r) => {
          acc[r.collection] = (acc[r.collection] || 0) + 1;
          return acc;
        }, {})
      },
      quarantinedRecords: manifest.quarantinedRecords,
      unresolvedNestedRecords: manifest.unresolvedNestedRecords,
      linkageErrors: manifest.linkageErrors,
      integrityFailures: manifest.integrityFailures || [],
      recoveryGapAnalysis: RECOVERY_GAP_ANALYSIS,
      auditLog: [...this.auditLog]
    };

    return report;
  }

  /**
   * Phase 7: Maintenance Window Guard
   */
  engageMaintenanceLock() {
    this.maintenanceLocked = true;
    this.log('Phase 7: Maintenance lock ENGAGED. Concurrent transactions blocked.');
  }

  releaseMaintenanceLock() {
    this.maintenanceLocked = false;
    this.log('Phase 7: Maintenance lock RELEASED.');
  }

  /**
   * Intercept incoming transaction attempts during maintenance lock
   */
  interceptTransactionAttempt(txType, txDetails) {
    if (this.maintenanceLocked) {
      throw new Error(`MAINTENANCE_LOCK_ACTIVE: System is locked for transactional reset commissioning. Cannot process ${txType}.`);
    }
    return true;
  }

  /**
   * IN-MEMORY SIMULATION ONLY: Simulates batch deletions on a SyntheticFirestore instance
   * for testing recovery behaviors, two-phase journaling, and clean-slate preconditions.
   *
   * STRICT AIR-GAP: Refuses execution if store is not explicitly marked with isSynthetic: true.
   * DOES NOT TOUCH LIVE FIRESTORE.
   */
  simulateBatchDeletions(store, options = {}) {
    this.assertQuarantine(store);

    if (!this.manifest) {
      this.generateManifest(store);
    }

    if (!this.manifest.eligibleForReset) {
      throw new Error(
        `EXECUTION_HALTED: Manifest is not eligible for reset (eligibleForReset is false: ` +
        `${this.manifest.quarantinedRecords.length} quarantined, ${this.manifest.linkageErrors.length} linkage errors, ` +
        `${this.manifest.unresolvedNestedRecords ? this.manifest.unresolvedNestedRecords.length : 0} unresolved nested).`
      );
    }

    this.engageMaintenanceLock();
    this.journal = [];

    // Initialize durable journal in synthetic store
    const journalDoc = {
      _firestoreId: '_resetJournal',
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      completedAt: null,
      manifestHash: this.manifest.manifestHash,
      currentStage: 1,
      currentRecordId: null,
      interruptedAt: null,
      error: null,
      entries: []
    };
    store.set('system', '_resetJournal', journalDoc);

    const batches = this.manifest.topologicalBatches;

    for (const batch of batches) {
      journalDoc.currentStage = batch.stage;

      // Simulated failure before stage start if requested
      if (options.failAtStage === batch.stage && !options.failAtRecord) {
        journalDoc.status = 'INTERRUPTED';
        journalDoc.interruptedAt = new Date().toISOString();
        journalDoc.error = `SIMULATED_FAILURE: Error committing stage ${batch.stage} (${batch.name})`;
        store.set('system', '_resetJournal', journalDoc);
        this.log(`SIMULATED_FAILURE: Injected batch failure during stage ${batch.stage} (${batch.name})`, 'error');
        throw new Error(`BATCH_EXECUTION_FAILED: Error committing stage ${batch.stage} (${batch.name})`);
      }

      for (const rec of batch.records) {
        // Protected collection safety check
        if (PROTECTED_COLLECTIONS.includes(rec.collection)) {
          journalDoc.status = 'INTERRUPTED';
          journalDoc.error = `FATAL_SAFETY_VIOLATION: Attempted to delete protected master data in '${rec.collection}'!`;
          store.set('system', '_resetJournal', journalDoc);
          throw new Error(`FATAL_SAFETY_VIOLATION: Attempted to delete protected master data in '${rec.collection}'!`);
        }

        // 1. Two-phase journal: Mark PROPOSED in store before deletion
        const journalEntry = {
          timestamp: new Date().toISOString(),
          stage: batch.stage,
          collection: rec.collection,
          id: rec.id,
          state: 'PROPOSED',
          success: false
        };
        journalDoc.entries.push(journalEntry);
        journalDoc.currentRecordId = `${rec.collection}/${rec.id}`;
        store.set('system', '_resetJournal', journalDoc);

        // Check for injected record-level crash or failure
        if (options.failAtRecord && options.failAtRecord === rec.id) {
          journalEntry.state = 'UNVERIFIED';
          journalDoc.status = 'INTERRUPTED';
          journalDoc.interruptedAt = new Date().toISOString();
          journalDoc.error = `SIMULATED_INTERRUPTION: Crash while deleting record ${rec.id}`;
          store.set('system', '_resetJournal', journalDoc);
          this.log(`SIMULATED_INTERRUPTION: Crash on record ${rec.id}`, 'error');
          throw new Error(`INTERRUPTED_EXECUTION: Simulated crash during deletion of ${rec.collection}/${rec.id}`);
        }

        // 2. Perform deletion in synthetic memory
        const deleted = store.delete(rec.collection, rec.id);

        // 3. Mark COMMITTED in store after successful deletion
        journalEntry.state = 'COMMITTED';
        journalEntry.success = deleted;
        store.set('system', '_resetJournal', journalDoc);

        this.journal.push(journalEntry);
      }
      this.log(`Phase 8: Batch ${batch.stage} (${batch.name}) committed — ${batch.records.length} records removed`);
    }

    // Mark reset journal completed
    journalDoc.status = 'COMPLETED';
    journalDoc.completedAt = new Date().toISOString();
    store.set('system', '_resetJournal', journalDoc);

    return {
      success: true,
      journalEntriesCount: this.journal.length,
      journal: this.journal
    };
  }

  /**
   * Phase 9: Post-Deletion Verification & Clean Slate Assertion
   */
  verifyCleanSlate(store) {
    this.assertQuarantine(store);
    const residuals = [];

    // 1. Check every target collection in allowlist without exception
    for (const [colName, targetConfig] of Object.entries(ALLOWED_TRANSACTION_COLLECTIONS)) {
      const docs = store.list(colName);
      // For receipts, ignore preserved physical receipts
      const activeTestDocs = docs.filter(d => {
        if (colName === 'receipts' && (String(d._firestoreId).startsWith('rcpt_phys_') || d.source === 'physical' || d.isPhysical === true)) {
          return false;
        }
        return true;
      });

      if (activeTestDocs.length > 0) {
        residuals.push(`${colName} has ${activeTestDocs.length} lingering document(s) (e.g. ${activeTestDocs[0]._firestoreId})`);
      }
    }

    // 2. Check system collection for lingering software reservations or idempotency tokens
    const sysDocs = store.list('system');
    for (const d of sysDocs) {
      const id = d._firestoreId || String(d.id);
      if (/^res_[0-9]+$/.test(id)) {
        residuals.push(`Lingering software reservation '${id}' in system`);
      }
      if (/^op_[A-Za-z0-9_-]+$/.test(id) && !id.startsWith('op_phys_')) {
        residuals.push(`Lingering software idempotency token '${id}' in system`);
      }
    }

    // 3. Check for lingering unknown collections
    const allCollections = store.listCollections();
    for (const col of allCollections) {
      if (!ALLOWED_TRANSACTION_COLLECTIONS[col] && !PROTECTED_COLLECTIONS.includes(col) && col !== 'system') {
        const count = store.list(col).length;
        if (count > 0) {
          residuals.push(`Lingering unknown collection '${col}' (${count} documents)`);
        }
      }
    }

    // 4. Verify durable journal status is COMPLETED
    const journalDoc = store.get('system', '_resetJournal');
    if (journalDoc && journalDoc.status !== 'COMPLETED') {
      residuals.push(`Incomplete reset journal in system: status is '${journalDoc.status}' (stage ${journalDoc.currentStage})`);
    }

    if (residuals.length > 0) {
      this.log(`Phase 9: Clean Slate Assertion FAILED: ${residuals.join('; ')}`, 'error');
      return { clean: false, residuals };
    }

    this.log('Phase 9: Post-Deletion Clean Slate Assertion PASSED (0 lingering software transactions or reservations)');
    return { clean: true, residuals: [] };
  }

  /**
   * Phase 10: Atomic Counter Initialization & Commissioning Gate
   * Resets voucherCounter to 500 when test vouchers are purged,
   * preserves existing receiptCounter policy, and zeroes billing sequences.
   */
  initializeCounters(store, options = {}) {
    this.assertQuarantine(store);
    const cleanSlate = this.verifyCleanSlate(store);
    if (!cleanSlate.clean) {
      throw new Error(`COUNTER_INIT_BLOCKED: Cannot initialize counters — residual records exist: ${cleanSlate.residuals.join(', ')}`);
    }

    if (options.failCounterInit) {
      throw new Error('COUNTER_INIT_FAILED: Injected write failure during atomic counter transaction.');
    }

    // Read current counters to preserve preserved counters
    const currentCounters = store.get('system', 'counters') || {};

    const initializedCounters = {
      _firestoreId: 'counters',
      _firestoreCollection: 'system',
      globalSequenceCounter: 0,
      billingReceiptCounter: 0,
      voucherCounter: 500, // Policy: Clean slate resets to 500 so first production voucher is V-501
      receiptCounter: currentCounters.receiptCounter !== undefined ? currentCounters.receiptCounter : 1000,
      billingPrefix: 'BILL-',
      receiptPrefix: 'R-',
      voucherPrefix: 'V-',
      _resetAt: new Date().toISOString(),
      _resetMode: 'synthetic_isolated_commissioning'
    };

    store.set('system', 'counters', initializedCounters);
    this.log(`Phase 10: Atomic Counter Initialization SUCCESSFUL (gsc=${initializedCounters.globalSequenceCounter}, brc=${initializedCounters.billingReceiptCounter}, vc=${initializedCounters.voucherCounter}, rc=${initializedCounters.receiptCounter})`);

    return initializedCounters;
  }

  /**
   * Commissioning Guard: Execute Next Genuine Transaction in Synthetic Store
   * Enforces:
   * 1. If globalSequenceCounter === 0, independent receipts are BLOCKED from consuming sequence 1 before BILL-001.
   * 2. Successful inaugural billing creates BILL-001 and linked accounting receipt R-001.
   * 3. Payment vouchers start from V-501.
   */
  executeCommissioningTransaction(store, txRequest) {
    this.assertQuarantine(store);

    if (this.maintenanceLocked) {
      throw new Error('COMMISSIONING_ERROR: System is currently under maintenance lock.');
    }

    const counters = store.get('system', 'counters');
    if (!counters) {
      throw new Error('COMMISSIONING_ERROR: Counters document missing in store.');
    }

    const curGsc = Number(counters.globalSequenceCounter) || 0;

    // RULE: If curGsc === 0, independent receipts CANNOT consume sequence 1 before inaugural bill!
    if (curGsc === 0 && txRequest.type === 'independent_receipt') {
      throw new Error(
        `COMMISSIONING_GUARD_VIOLATION: Inaugural transaction must be a Vazhipadu Bill (BILL-001 / R-001). ` +
        `Independent receipts cannot consume sequence 1 before the inaugural bill.`
      );
    }

    if (txRequest.type === 'billing') {
      const nextSeq = curGsc + 1;
      const formattedSeq = String(nextSeq).padStart(3, '0');
      const billNo = `BILL-${formattedSeq}`;
      const rcptNo = `R-${formattedSeq}`;
      const billDocId = `bill_${nextSeq}`;
      const rcptDocId = `rcpt_${nextSeq}`;
      const resDocId = `res_${nextSeq}`;
      const opDocId = `op_bill_${nextSeq}`;

      // Collision loop assertion
      if (store.get('system', resDocId) || store.get('billing', billDocId) || store.get('receipts', rcptDocId)) {
        throw new Error(`COLLISION_DETECTED: Target document ${billDocId} or ${resDocId} already exists! Residual cleanup failure.`);
      }

      // Write reservation
      store.set('system', resDocId, {
        _firestoreId: resDocId,
        seqNumber: nextSeq,
        formattedNo: formattedSeq,
        type: 'billing_linked',
        status: 'active',
        billDocId,
        receiptDocId: rcptDocId,
        operationId: opDocId,
        createdAt: Date.now()
      });

      // Write bill
      store.set('billing', billDocId, {
        _firestoreId: billDocId,
        id: nextSeq,
        receiptNo: billNo,
        accountingReceiptId: rcptDocId,
        accountingReceiptNo: rcptNo,
        reservationDocId: resDocId,
        operationId: opDocId,
        totalAmount: txRequest.totalAmount || 100,
        devoteeName: txRequest.devoteeName || 'Inaugural Devotee',
        fund: txRequest.fund || 'General Temple Fund',
        createdAt: Date.now()
      });

      // Write accounting receipt
      store.set('receipts', rcptDocId, {
        _firestoreId: rcptDocId,
        id: nextSeq,
        receiptNo: rcptNo,
        source: 'billing',
        billingId: nextSeq,
        billingFirestoreId: billDocId,
        billingReceiptNo: billNo,
        reservationDocId: resDocId,
        operationId: opDocId,
        amount: txRequest.totalAmount || 100,
        name: txRequest.devoteeName || 'Inaugural Devotee',
        fund: txRequest.fund || 'General Temple Fund',
        createdAt: Date.now()
      });

      // Write idempotency
      store.set('system', opDocId, {
        _firestoreId: opDocId,
        operationId: opDocId,
        seqNumber: nextSeq,
        resDocId,
        billDocId,
        receiptDocId: rcptDocId,
        status: 'committed',
        createdAt: Date.now()
      });

      // Increment counters
      counters.globalSequenceCounter = nextSeq;
      counters.billingReceiptCounter = nextSeq;
      store.set('system', 'counters', counters);

      return {
        success: true,
        type: 'billing',
        billNo,
        accountingReceiptNo: rcptNo,
        seqNumber: nextSeq,
        billDocId,
        receiptDocId: rcptDocId,
        resDocId
      };
    } else if (txRequest.type === 'independent_receipt') {
      const nextSeq = curGsc + 1;
      const formattedSeq = String(nextSeq).padStart(3, '0');
      const rcptNo = `R-${formattedSeq}`;
      const rcptDocId = `rcpt_${nextSeq}`;
      const resDocId = `res_${nextSeq}`;
      const opDocId = `op_rcpt_${nextSeq}`;

      store.set('system', resDocId, {
        _firestoreId: resDocId,
        seqNumber: nextSeq,
        formattedNo: formattedSeq,
        type: 'independent_receipt',
        status: 'active',
        receiptDocId: rcptDocId,
        operationId: opDocId,
        createdAt: Date.now()
      });

      store.set('receipts', rcptDocId, {
        _firestoreId: rcptDocId,
        id: nextSeq,
        receiptNo: rcptNo,
        source: 'firestore',
        billingId: null,
        billingFirestoreId: null,
        billingReceiptNo: null,
        reservationDocId: resDocId,
        operationId: opDocId,
        amount: txRequest.amount || 50,
        name: txRequest.name || 'Devotee',
        fund: txRequest.fund || 'General Temple Fund',
        category: txRequest.category || 'General Donation',
        createdAt: Date.now()
      });

      store.set('system', opDocId, {
        _firestoreId: opDocId,
        operationId: opDocId,
        seqNumber: nextSeq,
        resDocId,
        receiptDocId: rcptDocId,
        status: 'committed',
        createdAt: Date.now()
      });

      counters.globalSequenceCounter = nextSeq;
      store.set('system', 'counters', counters);

      return {
        success: true,
        type: 'independent_receipt',
        receiptNo: rcptNo,
        seqNumber: nextSeq,
        receiptDocId: rcptDocId,
        resDocId
      };
    } else if (txRequest.type === 'payment') {
      const nextVc = (Number(counters.voucherCounter) || 500) + 1;
      const voucherNo = `V-${nextVc}`;
      const payDocId = `pay_${nextVc}`;

      store.set('payments', payDocId, {
        _firestoreId: payDocId,
        id: nextVc,
        voucherNo,
        amount: txRequest.amount || 100,
        fund: txRequest.fund || 'General Temple Fund',
        category: txRequest.category || txRequest.expenseCategory || 'Temple Maintenance',
        paidTo: txRequest.paidTo || 'Vendor',
        createdAt: Date.now()
      });

      counters.voucherCounter = nextVc;
      store.set('system', 'counters', counters);

      return {
        success: true,
        type: 'payment',
        voucherNo,
        payDocId,
        voucherCounter: nextVc
      };
    } else {
      throw new Error(`Unsupported transaction type: ${txRequest.type}`);
    }
  }

  // =========================================================================
  // UNCONDITIONAL EXECUTION LOCK ENFORCEMENT (REQUIREMENT B & TEST 15)
  //
  // Physical or live execution is permanently and unconditionally disabled.
  // Every destructive entry point throws EXECUTE_MODE_DISABLED immediately.
  // =========================================================================

  execute(manifest, options = {}) {
    const error = new Error(
      'EXECUTE_MODE_DISABLED: Execution mode is strictly and unconditionally disabled in STEP 33.140. ' +
      'Physical deletion of records is permanently prohibited in this tool.'
    );
    error.code = 'EXECUTE_MODE_DISABLED';
    error.details = {
      attemptedMode: 'execute',
      mutationsPerformed: 0,
      deletionsPerformed: 0,
      trusteeApprovalBypassed: false,
      reason:
        'Safety boundary enforcement. STEP 33.140 permits only offline dry-run validation, manifest generation, ' +
        'and synthetic simulation. Live execution is unconditionally locked.'
    };
    throw error;
  }

  executeReset(manifest, options = {}) {
    return this.execute(manifest, options);
  }

  executeCleanup(manifest, options = {}) {
    return this.execute(manifest, options);
  }

  performLiveDeletion(manifest, options = {}) {
    return this.execute(manifest, options);
  }

  executeBatchedDeletions(manifest, options = {}) {
    return this.execute(manifest, options);
  }
}

// ---------------------------------------------------------------------------
// CLI Execution Interface (Dry-Run / Manifest Validation Only)
// ---------------------------------------------------------------------------

function runCli() {
  const args = process.argv.slice(2);

  // Check for forbidden execution flags
  const executionFlags = ['--execute', '--run', '--delete', '--force', '--live', '--unlock', '-e'];
  for (const flag of executionFlags) {
    if (args.includes(flag)) {
      console.error('\n[FATAL ERROR] EXECUTE_MODE_DISABLED: Live execution is strictly prohibited.');
      console.error('STEP 33.140 mandates that execution remains unconditionally disabled.');
      process.exit(1);
    }
  }

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Transactional Reset Orchestrator — Administrative Tool (STEP 33.140)
Offline-Only, Execution Locked

Usage:
  node scripts/transactional_reset_orchestrator.js --dry-run <path-to-export.json>
  node scripts/transactional_reset_orchestrator.js --validate-backup <path-to-export.json>

Options:
  --dry-run <path>           Generate an itemized manifest and dry-run report from a local JSON export
  --validate-backup <path>   Cryptographically verify an export JSON structure and SHA-256 integrity
  --help, -h                 Show this help information

Safety Restrictions:
  • Execution is unconditionally locked (EXECUTE_MODE_DISABLED).
  • Zero Firebase SDK or live database access.
  • Only explicitly supplied local JSON files are processed.
`);
    process.exit(0);
  }

  if (args.includes('--dry-run')) {
    const filePathIdx = args.indexOf('--dry-run') + 1;
    const filePath = args[filePathIdx];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`Error: File not found at '${filePath}'`);
      process.exit(1);
    }

    // Gate 3 Mandatory CLI Integrity Preflight:
    // 1. Read source bytes and compute SHA-256
    // 2. Validate export structure, canonical integrity hash, and required collection coverage
    // 3. Reject malformed, missing, incomplete, or tampered exports BEFORE synthetic store construction
    let rawBytes;
    try {
      rawBytes = fs.readFileSync(filePath);
    } catch (readErr) {
      console.error(`[CLI PREFLIGHT ERROR] Unable to read export file: ${readErr.message}`);
      process.exit(1);
    }

    let sourceIdentity;
    try {
      sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        filePath,
        requireIntegrityHash: true
      });
    } catch (preflightErr) {
      console.error(`[CLI PREFLIGHT ERROR] Export integrity preflight failed: ${preflightErr.message}`);
      console.error('Synthetic data store construction and manifest generation REFUSED.');
      process.exit(1);
    }

    // 4. Construct synthetic store ONLY from the validated export
    const parsed = JSON.parse(rawBytes.toString('utf8'));
    const store = new SyntheticFirestore(parsed, { sourceIdentity });

    // 5. Pass validated source identity into manifest generation & report
    const orch = new TransactionalResetOrchestrator();
    const report = orch.produceDryRunReport(store, { sourceIdentity });
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (args.includes('--validate-backup')) {
    const filePathIdx = args.indexOf('--validate-backup') + 1;
    const filePath = args[filePathIdx];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`Error: File not found at '${filePath}'`);
      process.exit(1);
    }
    try {
      const rawBytes = fs.readFileSync(filePath);
      const sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        filePath,
        requireIntegrityHash: true
      });
      console.log('Authoritative Backup Integrity: VALID');
      console.log(`Source File SHA-256: ${sourceIdentity.sourceFileSha256}`);
      console.log(`Canonical Payload SHA-256: ${sourceIdentity.integrityVerification.canonicalPayloadHash}`);
      process.exit(0);
    } catch (err) {
      console.error(`Authoritative Backup Integrity: INVALID (${err.message})`);
      process.exit(1);
    }
  }

  console.error('Unknown option. Run with --help for usage.');
  process.exit(1);
}

if (require.main === module) {
  runCli();
}

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

module.exports = {
  canonicalJsonStringify,
  computeSha256,
  ALLOWED_TRANSACTION_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  PROTECTED_SYSTEM_DOCS,
  REQUIRED_BACKUP_COLLECTIONS,
  DOCUMENTED_BACKUP_EXCLUSIONS,
  RECOVERY_GAP_ANALYSIS,
  SyntheticFirestore,
  TransactionalResetOrchestrator
};
