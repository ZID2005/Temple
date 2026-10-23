const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
let content = fs.readFileSync(targetPath, 'utf8');

function replaceExact(findStr, replaceStr, label) {
  if (!content.includes(findStr)) {
    throw new Error(`[FAIL] Could not find anchor string for ${label}`);
  }
  const count = content.split(findStr).length - 1;
  if (count > 1) {
    throw new Error(`[FAIL] Anchor string for ${label} is not unique (found ${count} occurrences)`);
  }
  content = content.replace(findStr, replaceStr);
  console.log(`[OK] Applied ${label}`);
}

// 1. Telemetry and Master Cache Definitions
replaceExact(
  '    function isBrowserStorageQuotaExceeded(err) {\n' +
  '      if (!err) return false;\n' +
  '      if (err.name === \'QuotaExceededError\' || err.name === \'NS_ERROR_DOM_QUOTA_REACHED\' || err.code === 22 || err.number === -2147024882) return true;\n' +
  '      const msg = String(err.message || err || \'\').toLowerCase();\n' +
  '      return msg.includes(\'quotaexceedederror\') || (msg.includes(\'quota\') && (msg.includes(\'storage\') || msg.includes(\'localstorage\') || msg.includes(\'indexeddb\') || msg.includes(\'setitem\')));\n' +
  '    }\n\n' +
  '    const DB_NAME = isEmulatorModeActive() ? \'temple_accounts_test_db\' : \'temple_accounts_db\';',

  '    function isBrowserStorageQuotaExceeded(err) {\n' +
  '      if (!err) return false;\n' +
  '      if (err.name === \'QuotaExceededError\' || err.name === \'NS_ERROR_DOM_QUOTA_REACHED\' || err.code === 22 || err.number === -2147024882) return true;\n' +
  '      const msg = String(err.message || err || \'\').toLowerCase();\n' +
  '      return msg.includes(\'quotaexceedederror\') || (msg.includes(\'quota\') && (msg.includes(\'storage\') || msg.includes(\'localstorage\') || msg.includes(\'indexeddb\') || msg.includes(\'setitem\')));\n' +
  '    }\n\n' +
  '    /* ===================== FIRESTORE READ TELEMETRY & MASTER CACHE (STEP 33.182) ===================== */\n' +
  '    window._firestoreReadMetrics = {\n' +
  '      totalDocumentReads: 0,\n' +
  '      queryCount: 0,\n' +
  '      byCollection: {},\n' +
  '      byCaller: {}\n' +
  '    };\n\n' +
  '    function trackFirestoreReads(collectionName, count, caller = \'unknown\') {\n' +
  '      if (!collectionName || typeof count !== \'number\' || count < 0) return;\n' +
  '      window._firestoreReadMetrics.totalDocumentReads += count;\n' +
  '      window._firestoreReadMetrics.queryCount += 1;\n' +
  '      window._firestoreReadMetrics.byCollection[collectionName] =\n' +
  '        (window._firestoreReadMetrics.byCollection[collectionName] || 0) + count;\n' +
  '      window._firestoreReadMetrics.byCaller[caller] =\n' +
  '        (window._firestoreReadMetrics.byCaller[caller] || 0) + count;\n' +
  '    }\n\n' +
  '    function getFirestoreReadMetrics() {\n' +
  '      return JSON.parse(JSON.stringify(window._firestoreReadMetrics));\n' +
  '    }\n\n' +
  '    function resetFirestoreReadMetrics() {\n' +
  '      window._firestoreReadMetrics = {\n' +
  '        totalDocumentReads: 0,\n' +
  '        queryCount: 0,\n' +
  '        byCollection: {},\n' +
  '        byCaller: {}\n' +
  '      };\n' +
  '    }\n\n' +
  '    const MASTER_DATA_STORES = new Set([\'funds\', \'incomeCategories\', \'expenseCategories\', \'bankAccounts\']);\n' +
  '    window.MASTER_DATA_STORES = MASTER_DATA_STORES;\n' +
  '    const _masterDataMemoryCache = new Map();\n' +
  '    window._masterDataMemoryCache = _masterDataMemoryCache;\n' +
  '    const MASTER_DATA_CACHE_TTL_MS = 60000; // 60 seconds short-lived in-memory cache\n\n' +
  '    function invalidateMasterDataCache(storeName) {\n' +
  '      const memCache = (typeof _masterDataMemoryCache !== \'undefined\') ? _masterDataMemoryCache : (typeof window !== \'undefined\' && window._masterDataMemoryCache ? window._masterDataMemoryCache : null);\n' +
  '      if (!memCache) return;\n' +
  '      if (storeName) {\n' +
  '        memCache.delete(storeName);\n' +
  '      } else {\n' +
  '        memCache.clear();\n' +
  '      }\n' +
  '    }\n\n' +
  '    const DB_NAME = isEmulatorModeActive() ? \'temple_accounts_test_db\' : \'temple_accounts_db\';',
  '1. Telemetry and Master Cache Definitions'
);

// 2. Balance Engine Helpers (Preloaded Dataset Support)
const startAnchor = '    /* ---------- BALANCE ENGINE ---------- */';
const endAnchor = '\n\n    /* ==========================================================================\n       REFERENCE-MATCHED MOTION & TEXT ANIMATION ENGINE (STEP 20.2)';
const sIdx = content.indexOf(startAnchor);
const eIdx = content.indexOf(endAnchor);
if (sIdx === -1 || eIdx === -1 || sIdx >= eIdx) {
  throw new Error('[FAIL] Invariant anchors for Balance Engine helpers could not be resolved');
}
const balanceEngineSlice = content.substring(sIdx, eIdx);

replaceExact(
  balanceEngineSlice,

  '    /* ---------- BALANCE ENGINE (STEP 33.182: Preloaded Dataset Optimization) ---------- */\n' +
  '    async function getCashBalance(uptoDate, preloadedData) {\n' +
  '      const s = window.APP_SETTINGS || {};\n' +
  '      const [receipts, payments, transfers, loans, collections, payouts] = preloadedData ? [\n' +
  '        preloadedData.receipts, preloadedData.payments, preloadedData.transfers,\n' +
  '        preloadedData.loans, preloadedData.collections, preloadedData.payouts\n' +
  '      ] : await Promise.all([\n' +
  '        activeReceipts(), activePayments(), activeTransfers(), allLoans(), activeChittyCollections(), activeChittyPayouts()\n' +
  '      ]);\n' +
  '      const inRange = (arr) => uptoDate ? (arr || []).filter(x => x.date <= uptoDate) : (arr || []);\n' +
  '      let bal = parseFloat(s.openingCash) || 0;\n' +
  '      bal += sumField(inRange(receipts).filter(r => r.paymentMode === \'Cash\'), \'amount\');\n' +
  '      bal -= sumField(inRange(payments).filter(p => p.paymentMode === \'Cash\'), \'amount\');\n' +
  '      bal += sumField(inRange(loans).filter(l => l.paymentMode === \'Cash\'), \'loanReceived\');\n' +
  '      bal -= sumField(inRange(loans).filter(l => l.paymentMode === \'Cash\'), \'repayment\');\n' +
  '      bal += sumField(inRange(collections).filter(c => c.paymentMode === \'Cash\'), \'amountReceived\');\n' +
  '      bal -= sumField(inRange(payouts).filter(p => p.paymentMode === \'Cash\'), \'amount\');\n' +
  '      inRange(transfers).forEach(t => {\n' +
  '        if (t.fromAcc === \'Cash\') bal -= parseFloat(t.amount) || 0;\n' +
  '        if (t.toAcc === \'Cash\') bal += parseFloat(t.amount) || 0;\n' +
  '      });\n' +
  '      return bal;\n' +
  '    }\n' +
  '    async function getBankBalance(uptoDate, preloadedData) {\n' +
  '      const s = window.APP_SETTINGS || {};\n' +
  '      const [receipts, payments, transfers, loans, collections, payouts] = preloadedData ? [\n' +
  '        preloadedData.receipts, preloadedData.payments, preloadedData.transfers,\n' +
  '        preloadedData.loans, preloadedData.collections, preloadedData.payouts\n' +
  '      ] : await Promise.all([\n' +
  '        activeReceipts(), activePayments(), activeTransfers(), allLoans(), activeChittyCollections(), activeChittyPayouts()\n' +
  '      ]);\n' +
  '      const inRange = (arr) => uptoDate ? (arr || []).filter(x => x.date <= uptoDate) : (arr || []);\n' +
  '      const isBankMode = (mode) => mode === \'Bank\' || mode === \'UPI\';\n' +
  '      let bal = parseFloat(s.openingBank) || 0;\n' +
  '      bal += sumField(inRange(receipts).filter(r => isBankMode(r.paymentMode)), \'amount\');\n' +
  '      bal -= sumField(inRange(payments).filter(p => isBankMode(p.paymentMode)), \'amount\');\n' +
  '      bal += sumField(inRange(loans).filter(l => isBankMode(l.paymentMode)), \'loanReceived\');\n' +
  '      bal -= sumField(inRange(loans).filter(l => isBankMode(l.paymentMode)), \'repayment\');\n' +
  '      bal += sumField(inRange(collections).filter(c => isBankMode(c.paymentMode)), \'amountReceived\');\n' +
  '      bal -= sumField(inRange(payouts).filter(p => isBankMode(p.paymentMode)), \'amount\');\n' +
  '      inRange(transfers).forEach(t => {\n' +
  '        if (t.fromAcc === \'Bank\') bal -= parseFloat(t.amount) || 0;\n' +
  '        if (t.toAcc === \'Bank\') bal += parseFloat(t.amount) || 0;\n' +
  '      });\n' +
  '      return bal;\n' +
  '    }\n' +
  '    async function getFundBalance(fundName, uptoDate, preloadedData) {\n' +
  '      const s = window.APP_SETTINGS || {};\n' +
  '      const [receipts, payments, collections, payouts] = preloadedData ? [\n' +
  '        preloadedData.receipts, preloadedData.payments, preloadedData.collections, preloadedData.payouts\n' +
  '      ] : await Promise.all([\n' +
  '        activeReceipts(), activePayments(), activeChittyCollections(), activeChittyPayouts()\n' +
  '      ]);\n' +
  '      const inRange = (arr) => uptoDate ? (arr || []).filter(x => x.date <= uptoDate) : (arr || []);\n' +
  '      let opening = 0;\n' +
  '      if (fundName === \'General Temple Fund\') opening = parseFloat(s.openingGeneralFund) || 0;\n' +
  '      if (fundName === \'Punarudharanam Fund\') opening = parseFloat(s.openingPunarudharanamFund) || 0;\n' +
  '      if (fundName === \'Chitty Fund\') opening = parseFloat(s.openingChittyBalance) || 0;\n' +
  '      let bal = opening;\n' +
  '      bal += sumField(inRange(receipts).filter(r => r.fund === fundName), \'amount\');\n' +
  '      bal -= sumField(inRange(payments).filter(p => p.fund === fundName), \'amount\');\n' +
  '      if (fundName === \'Chitty Fund\') {\n' +
  '        bal += sumField(inRange(collections), \'amountReceived\');\n' +
  '        bal += sumField(inRange(payouts), \'amount\');\n' +
  '      }\n' +
  '      return bal;\n' +
  '    }\n' +
  '    async function getAllFundBalances(uptoDate, preloadedData) {\n' +
  '      const funds = (preloadedData && preloadedData.funds) ? preloadedData.funds : await allFunds();\n' +
  '      const out = [];\n' +
  '      for (const f of funds) out.push({ name: f.name, balance: await getFundBalance(f.name, uptoDate, preloadedData) });\n' +
  '      return out;\n' +
  '    }\n' +
  '    async function getLoanOutstanding(preloadedData) {\n' +
  '      const s = window.APP_SETTINGS || {};\n' +
  '      const loans = (preloadedData && preloadedData.loans) ? preloadedData.loans : await allLoans();\n' +
  '      let bal = parseFloat(s.openingLoans) || 0;\n' +
  '      bal += sumField(loans, \'loanReceived\');\n' +
  '      bal -= sumField(loans, \'repayment\');\n' +
  '      return bal;\n' +
  '    }\n' +
  '    async function getChittyOutstanding(preloadedData) {\n' +
  '      const members = (preloadedData && preloadedData.chittyMembers) ? preloadedData.chittyMembers : await activeChittyMembers();\n' +
  '      const collections = (preloadedData && preloadedData.collections) ? preloadedData.collections : await activeChittyCollections();\n' +
  '      let totalPaid = sumField(collections, \'amountReceived\');\n' +
  '      return { totalPaid, memberCount: members.length };\n' +
  '    }\n' +
  '    async function monthIncomeExpense(monthStart, monthEnd, preloadedData) {\n' +
  '      const receipts = ((preloadedData && preloadedData.receipts) ? preloadedData.receipts : await activeReceipts()).filter(r => r.date >= monthStart && r.date <= monthEnd);\n' +
  '      const payments = ((preloadedData && preloadedData.payments) ? preloadedData.payments : await activePayments()).filter(p => p.date >= monthStart && p.date <= monthEnd);\n' +
  '      return { income: sumField(receipts, \'amount\'), expense: sumField(payments, \'amount\') };\n' +
  '    }',
  '2. Balance Engine Helpers'
);

// 3. Dashboard Single-Flight Fetch
replaceExact(
  '    /* ===================== DASHBOARD ===================== */\n' +
  '    VIEW_RENDERERS.dashboard = async function () {\n' +
  '      const s = window.APP_SETTINGS;\n' +
  '      const [cash, bank, funds, loanOut, chitty] = await Promise.all([\n' +
  '        getCashBalance(), getBankBalance(), getAllFundBalances(), getLoanOutstanding(), getChittyOutstanding()\n' +
  '      ]);\n' +
  '      const generalFund = funds.find(f => f.name === \'General Temple Fund\');\n' +
  '      const punaFund = funds.find(f => f.name === \'Punarudharanam Fund\');\n' +
  '      const chittyFund = funds.find(f => f.name === \'Chitty Fund\');\n' +
  '      const now = new Date();\n' +
  '      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, \'0\')}-01`;\n' +
  '      const monthEnd = todayISO();\n' +
  '      const { income, expense } = await monthIncomeExpense(monthStart, monthEnd);\n' +
  '      const surplus = income - expense;\n\n' +
  '      const receipts = await activeReceipts();\n' +
  '      const payments = await activePayments();',

  '    /* ===================== DASHBOARD (STEP 33.182: Single-Flight Optimized) ===================== */\n' +
  '    VIEW_RENDERERS.dashboard = async function () {\n' +
  '      const s = window.APP_SETTINGS;\n' +
  '      const [receipts, payments, transfers, loans, collections, payouts, fundsList, chittyMembers] = await Promise.all([\n' +
  '        activeReceipts(),\n' +
  '        activePayments(),\n' +
  '        activeTransfers(),\n' +
  '        allLoans(),\n' +
  '        activeChittyCollections(),\n' +
  '        activeChittyPayouts(),\n' +
  '        allFunds(),\n' +
  '        activeChittyMembers()\n' +
  '      ]);\n' +
  '      const preloadedData = {\n' +
  '        receipts,\n' +
  '        payments,\n' +
  '        transfers,\n' +
  '        loans,\n' +
  '        collections,\n' +
  '        payouts,\n' +
  '        funds: fundsList,\n' +
  '        chittyMembers\n' +
  '      };\n\n' +
  '      const [cash, bank, funds, loanOut, chitty] = await Promise.all([\n' +
  '        getCashBalance(null, preloadedData),\n' +
  '        getBankBalance(null, preloadedData),\n' +
  '        getAllFundBalances(null, preloadedData),\n' +
  '        getLoanOutstanding(preloadedData),\n' +
  '        getChittyOutstanding(preloadedData)\n' +
  '      ]);\n' +
  '      const generalFund = funds.find(f => f.name === \'General Temple Fund\');\n' +
  '      const punaFund = funds.find(f => f.name === \'Punarudharanam Fund\');\n' +
  '      const chittyFund = funds.find(f => f.name === \'Chitty Fund\');\n' +
  '      const now = new Date();\n' +
  '      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, \'0\')}-01`;\n' +
  '      const monthEnd = todayISO();\n' +
  '      const { income, expense } = await monthIncomeExpense(monthStart, monthEnd, preloadedData);\n' +
  '      const surplus = income - expense;',
  '3. Dashboard Single-Flight Fetch'
);

// 4. deleteReceiptRecord Redundant Reads Elimination
replaceExact(
  '        await refreshSettings();\n' +
  '        await fsGetAllSafe(\'receipts\');\n' +
  '        await fsGetAllSafe(\'billing\');\n' +
  '        if (typeof refreshBillingHistory === \'function\') {\n' +
  '          await refreshBillingHistory().catch(() => {});\n' +
  '        }\n' +
  '        await navigate(CURRENT_VIEW === \'receipts\' ? \'receipts\' : CURRENT_VIEW);',

  '        await refreshSettings();\n' +
  '        if (typeof refreshBillingHistory === \'function\' && CURRENT_VIEW === \'billing\') {\n' +
  '          await refreshBillingHistory().catch(() => {});\n' +
  '        }\n' +
  '        await navigate(CURRENT_VIEW === \'receipts\' ? \'receipts\' : CURRENT_VIEW);',
  '4. deleteReceiptRecord Redundant Reads Elimination'
);

// 5a. Telemetry in getOccupiedBillingSequenceNumbers
replaceExact(
  '          const [bSnap, rSnap, sSnap] = await Promise.all([\n' +
  '            db.collection(\'billing\').get(),\n' +
  '            db.collection(\'receipts\').get(),\n' +
  '            db.collection(\'system\').get()\n' +
  '          ]);',

  '          const [bSnap, rSnap, sSnap] = await Promise.all([\n' +
  '            db.collection(\'billing\').get(),\n' +
  '            db.collection(\'receipts\').get(),\n' +
  '            db.collection(\'system\').get()\n' +
  '          ]);\n\n' +
  '          if (typeof trackFirestoreReads === \'function\') {\n' +
  '            trackFirestoreReads(\'billing\', bSnap ? (bSnap.docs ? bSnap.docs.length : (bSnap.size || 0)) : 0, \'getOccupiedBillingSequenceNumbers\');\n' +
  '            trackFirestoreReads(\'receipts\', rSnap ? (rSnap.docs ? rSnap.docs.length : (rSnap.size || 0)) : 0, \'getOccupiedBillingSequenceNumbers\');\n' +
  '            trackFirestoreReads(\'system\', sSnap ? (sSnap.docs ? sSnap.docs.length : (sSnap.size || 0)) : 0, \'getOccupiedBillingSequenceNumbers\');\n' +
  '          }',
  '5a. Telemetry in getOccupiedBillingSequenceNumbers'
);

// 5b. getNextAvailableBillingSeq and getNextBillingReceiptNo optimization
replaceExact(
  '    async function getNextAvailableBillingSeq(dbInstance) {\n' +
  '      const occupied = await getOccupiedBillingSequenceNumbers(dbInstance);\n' +
  '      let cand = 1;\n' +
  '      while (occupied.has(cand)) {\n' +
  '        cand++;\n' +
  '      }\n' +
  '      return cand;\n' +
  '    }\n\n' +
  '    async function getNextBillingReceiptNo() {\n' +
  '      try {\n' +
  '        const nextVal = await getNextAvailableBillingSeq();\n' +
  '        const c = await fsGetCounters();\n' +
  '        const prefix = (c && (c.billingPrefix || c.billingReceiptPrefix)) || \'BILL-\';\n' +
  '        return `${prefix}${String(nextVal).padStart(3, \'0\')}`;\n' +
  '      } catch (err) {\n' +
  '        console.warn(\'Error calculating next billing receipt number preview:\', err);\n' +
  '        return \'BILL-001\';\n' +
  '      }\n' +
  '    }',

  '    async function getNextAvailableBillingSeq(dbInstance, precomputedOccupied = null) {\n' +
  '      const occupied = precomputedOccupied || await getOccupiedBillingSequenceNumbers(dbInstance);\n' +
  '      let cand = 1;\n' +
  '      while (occupied.has(cand)) {\n' +
  '        cand++;\n' +
  '      }\n' +
  '      return cand;\n' +
  '    }\n\n' +
  '    async function getNextBillingReceiptNo() {\n' +
  '      try {\n' +
  '        const nextVal = await getNextAvailableBillingSeq();\n' +
  '        const c = await fsGetCounters();\n' +
  '        const prefix = (c && (c.billingPrefix || c.billingReceiptPrefix)) || \'BILL-\';\n' +
  '        return `${prefix}${String(nextVal).padStart(3, \'0\')}`;\n' +
  '      } catch (err) {\n' +
  '        console.warn(\'Error calculating next billing receipt number preview:\', err);\n' +
  '        return \'BILL-001\';\n' +
  '      }\n' +
  '    }',
  '5b. getNextAvailableBillingSeq and getNextBillingReceiptNo optimization'
);

// 6. Debounced Manual Bill Input & Stale Validation Prevention
replaceExact(
  '    /* Validate manual bill number input in real-time (STEP 33.8A / STEP 33.177) */\n' +
  '    async function validateManualBillNoInput(input) {\n' +
  '      const feedback = el(\'manualBillNoFeedback\');\n' +
  '      if (!feedback) return;\n' +
  '      const val = input.value.trim();\n' +
  '      if (!val) {\n' +
  '        feedback.style.display = \'none\';\n' +
  '        feedback.textContent = \'\';\n' +
  '        return;\n' +
  '      }\n' +
  '      const parsed = parseGlobalNumber(val);\n' +
  '      if (!parsed) {\n' +
  '        feedback.style.display = \'block\';\n' +
  '        feedback.style.background = \'#fff3cd\';\n' +
  '        feedback.style.color = \'#856404\';\n' +
  '        feedback.textContent = \'⚠ Invalid format. Please enter a positive sequential number (e.g. 001, 002) or standard prefix BILL-001.\';\n' +
  '        return;\n' +
  '      }\n' +
  '      try {\n' +
  '        const occupied = await getOccupiedBillingSequenceNumbers();\n' +
  '        const nextSeq = await getNextAvailableBillingSeq();\n' +
  '        if (occupied.has(parsed)) {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#f8d7da\';\n' +
  '          feedback.style.color = \'#721c24\';\n' +
  '          feedback.textContent = `❌ Number ${formatGlobalNumber(parsed, \'BILL-\')} is already reserved/issued. Numbers cannot be reused.`;\n' +
  '        } else if (parsed !== nextSeq) {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#f8d7da\';\n' +
  '          feedback.style.color = \'#721c24\';\n' +
  '          feedback.textContent = `❌ Number ${formatGlobalNumber(parsed, \'BILL-\')} is out of sequence. Next required number is ${formatGlobalNumber(nextSeq, \'BILL-\')}.`;\n' +
  '        } else {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#e6f4ea\';\n' +
  '          feedback.style.color = \'var(--green)\';\n' +
  '          feedback.textContent = `✓ Valid next sequential number: ${formatGlobalNumber(parsed, \'BILL-\')}`;\n' +
  '        }\n' +
  '      } catch (err) {\n' +
  '        feedback.style.display = \'block\';\n' +
  '        feedback.style.background = \'#e6f4ea\';\n' +
  '        feedback.style.color = \'var(--green)\';\n' +
  '        feedback.textContent = `Format parsed: ${formatGlobalNumber(parsed, \'BILL-\')}`;\n' +
  '      }\n' +
  '    }',

  '    /* Validate manual bill number input in real-time (STEP 33.8A / STEP 33.177 / STEP 33.182) */\n' +
  '    let _manualBillNoDebounceTimer = null;\n' +
  '    let _manualBillNoValidationSeq = 0;\n\n' +
  '    function onManualBillNoInput(input) {\n' +
  '      if (_manualBillNoDebounceTimer) {\n' +
  '        clearTimeout(_manualBillNoDebounceTimer);\n' +
  '        _manualBillNoDebounceTimer = null;\n' +
  '      }\n' +
  '      const val = input ? input.value.trim() : \'\';\n' +
  '      const feedback = el(\'manualBillNoFeedback\');\n' +
  '      const prevSpan = el(\'manualBillNoPreview\');\n\n' +
  '      if (!val) {\n' +
  '        if (feedback) {\n' +
  '          feedback.style.display = \'none\';\n' +
  '          feedback.textContent = \'\';\n' +
  '        }\n' +
  '        return;\n' +
  '      }\n\n' +
  '      // Quick non-authoritative format check for immediate responsive feedback\n' +
  '      const parsed = parseGlobalNumber(val);\n' +
  '      if (!parsed) {\n' +
  '        if (feedback) {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#fff3cd\';\n' +
  '          feedback.style.color = \'#856404\';\n' +
  '          feedback.textContent = \'⚠ Invalid format. Please enter a positive sequential number (e.g. 001, 002) or standard prefix BILL-001.\';\n' +
  '        }\n' +
  '        return;\n' +
  '      } else if (prevSpan) {\n' +
  '        prevSpan.textContent = formatGlobalNumber(parsed, \'BILL-\');\n' +
  '      }\n\n' +
  '      // Debounce server gap validation by 350ms\n' +
  '      _manualBillNoDebounceTimer = setTimeout(() => {\n' +
  '        _manualBillNoDebounceTimer = null;\n' +
  '        validateManualBillNoInput(input);\n' +
  '      }, 350);\n' +
  '    }\n\n' +
  '    async function validateManualBillNoInput(input) {\n' +
  '      if (_manualBillNoDebounceTimer) {\n' +
  '        clearTimeout(_manualBillNoDebounceTimer);\n' +
  '        _manualBillNoDebounceTimer = null;\n' +
  '      }\n' +
  '      const feedback = el(\'manualBillNoFeedback\');\n' +
  '      const prevSpan = el(\'manualBillNoPreview\');\n' +
  '      if (!feedback) return;\n' +
  '      const val = input ? input.value.trim() : \'\';\n' +
  '      if (!val) {\n' +
  '        feedback.style.display = \'none\';\n' +
  '        feedback.textContent = \'\';\n' +
  '        return;\n' +
  '      }\n' +
  '      const parsed = parseGlobalNumber(val);\n' +
  '      if (!parsed) {\n' +
  '        feedback.style.display = \'block\';\n' +
  '        feedback.style.background = \'#fff3cd\';\n' +
  '        feedback.style.color = \'#856404\';\n' +
  '        feedback.textContent = \'⚠ Invalid format. Please enter a positive sequential number (e.g. 001, 002) or standard prefix BILL-001.\';\n' +
  '        return;\n' +
  '      }\n\n' +
  '      // Stale asynchronous validation protection: track request sequence\n' +
  '      const reqSeq = ++_manualBillNoValidationSeq;\n\n' +
  '      try {\n' +
  '        // Single call to get occupied numbers (eliminates duplicate scan!)\n' +
  '        const occupied = await getOccupiedBillingSequenceNumbers();\n' +
  '        // Discard result if newer input was typed while awaiting\n' +
  '        if (reqSeq !== _manualBillNoValidationSeq) return;\n\n' +
  '        // Compute next sequence directly from occupied set without second query\n' +
  '        const nextSeq = await getNextAvailableBillingSeq(null, occupied);\n\n' +
  '        if (occupied.has(parsed)) {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#f8d7da\';\n' +
  '          feedback.style.color = \'#721c24\';\n' +
  '          feedback.textContent = `❌ Number ${formatGlobalNumber(parsed, \'BILL-\')} is already reserved/issued. Numbers cannot be reused.`;\n' +
  '        } else if (parsed !== nextSeq) {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#f8d7da\';\n' +
  '          feedback.style.color = \'#721c24\';\n' +
  '          feedback.textContent = `❌ Number ${formatGlobalNumber(parsed, \'BILL-\')} is out of sequence. Next required number is ${formatGlobalNumber(nextSeq, \'BILL-\')}.`;\n' +
  '        } else {\n' +
  '          feedback.style.display = \'block\';\n' +
  '          feedback.style.background = \'#e6f4ea\';\n' +
  '          feedback.style.color = \'var(--green)\';\n' +
  '          feedback.textContent = `✓ Valid next sequential number: ${formatGlobalNumber(parsed, \'BILL-\')}`;\n' +
  '        }\n' +
  '        if (prevSpan) {\n' +
  '          prevSpan.textContent = formatGlobalNumber(parsed, \'BILL-\');\n' +
  '        }\n' +
  '      } catch (err) {\n' +
  '        if (reqSeq !== _manualBillNoValidationSeq) return;\n' +
  '        feedback.style.display = \'block\';\n' +
  '        feedback.style.background = \'#e6f4ea\';\n' +
  '        feedback.style.color = \'var(--green)\';\n' +
  '        feedback.textContent = `Format parsed: ${formatGlobalNumber(parsed, \'BILL-\')}`;\n' +
  '      }\n' +
  '    }',
  '6. Debounced Manual Bill Input & Stale Validation Prevention'
);

// 7. billingSubmitForm Duplicate Scan Elimination
replaceExact(
  '        try {\n' +
  '          const occupied = await getOccupiedBillingSequenceNumbers();\n' +
  '          const nextSeq = await getNextAvailableBillingSeq();',

  '        try {\n' +
  '          const occupied = await getOccupiedBillingSequenceNumbers();\n' +
  '          const nextSeq = await getNextAvailableBillingSeq(null, occupied);',
  '7. billingSubmitForm Duplicate Scan Elimination'
);

// 8. deleteBillingRecord Redundant Refetch Elimination
replaceExact(
  '        await refreshSettings();\n' +
  '        await fsGetAllSafe(\'billing\');\n' +
  '        await fsGetAllSafe(\'receipts\');\n' +
  '        if (typeof refreshBillingHistory === \'function\') {\n' +
  '          await refreshBillingHistory().catch(() => {});\n' +
  '        }\n' +
  '        await navigate(CURRENT_VIEW === \'billing\' ? \'billing\' : CURRENT_VIEW);',

  '        await refreshSettings();\n' +
  '        if (typeof refreshBillingHistory === \'function\' && CURRENT_VIEW === \'billing\') {\n' +
  '          await refreshBillingHistory().catch(() => {});\n' +
  '        }\n' +
  '        await navigate(CURRENT_VIEW === \'billing\' ? \'billing\' : CURRENT_VIEW);',
  '8. deleteBillingRecord Redundant Refetch Elimination'
);

// 9. Input Tag oninput Update
replaceExact(
  'oninput="validateManualBillNoInput(this)"',
  'oninput="onManualBillNoInput(this)"',
  '9. Input Tag oninput Update'
);

// 10. VIEW_RENDERERS.trialbalance Single-Flight Fetch
replaceExact(
  '    /* ===================== TRIAL BALANCE ===================== */\n' +
  '    VIEW_RENDERERS.trialbalance = async function () {\n' +
  '      const [receipts, payments, cash, bank, funds, loanOut] = await Promise.all([\n' +
  '        activeReceipts(), activePayments(), getCashBalance(), getBankBalance(), getAllFundBalances(), getLoanOutstanding()\n' +
  '      ]);',

  '    /* ===================== TRIAL BALANCE (STEP 33.182: Single-Flight Optimized) ===================== */\n' +
  '    VIEW_RENDERERS.trialbalance = async function () {\n' +
  '      const [receipts, payments, transfers, loans, collections, payouts, fundsList] = await Promise.all([\n' +
  '        activeReceipts(),\n' +
  '        activePayments(),\n' +
  '        activeTransfers(),\n' +
  '        allLoans(),\n' +
  '        activeChittyCollections(),\n' +
  '        activeChittyPayouts(),\n' +
  '        allFunds()\n' +
  '      ]);\n' +
  '      const preloadedData = { receipts, payments, transfers, loans, collections, payouts, funds: fundsList };\n' +
  '      const [cash, bank, funds, loanOut] = await Promise.all([\n' +
  '        getCashBalance(null, preloadedData),\n' +
  '        getBankBalance(null, preloadedData),\n' +
  '        getAllFundBalances(null, preloadedData),\n' +
  '        getLoanOutstanding(preloadedData)\n' +
  '      ]);',
  '10. VIEW_RENDERERS.trialbalance Single-Flight Fetch'
);

// 11. fsGetAllSafe Master Data In-Memory Caching & Telemetry
replaceExact(
  '    async function fsGetAllSafe(storeName) {\n' +
  '      try {\n' +
  '        const user = getCurrentFirebaseUser();\n' +
  '        if (user) {\n' +
  '          const db = getFirestoreDb();\n' +
  '          if (db) {\n' +
  '            const snap = await db.collection(storeName).get();\n' +
  '            const records = [];\n' +
  '            snap.forEach(doc => {\n' +
  '              const data = doc.data();\n' +
  '              const legacyId = (data.legacyId !== undefined && data.legacyId !== null)\n' +
  '                ? data.legacyId\n' +
  '                : (data.id !== undefined ? data.id : doc.id);\n' +
  '              records.push({\n' +
  '                ...data,\n' +
  '                firestoreId: doc.id,\n' +
  '                id: legacyId\n' +
  '              });\n' +
  '            });\n\n' +
  '            // Background cache synchronization to IndexedDB: ensure cache mirrors authoritative Firestore\n' +
  '            if (typeof clearStore === \'function\' && typeof putRec === \'function\') {\n' +
  '              try {\n' +
  '                await clearStore(storeName);\n' +
  '                for (const rec of records) {\n' +
  '                  await putRec(storeName, rec);\n' +
  '                }\n' +
  '              } catch (cacheErr) {\n' +
  '                console.warn(`[Repository] Background cache update skipped for ${storeName}:`, cacheErr);\n' +
  '              }\n' +
  '            }\n\n' +
  '            return records;\n' +
  '          }\n' +
  '        }\n' +
  '      } catch (err) {\n' +
  '        console.warn(`[Repository] Firestore read failed for ${storeName}; using IndexedDB cache fallback:`, err);\n' +
  '      }\n\n' +
  '      // Fallback to IndexedDB cache\n' +
  '      if (typeof getAll === \'function\') {\n' +
  '        return await getAll(storeName);\n' +
  '      }\n' +
  '      return [];\n' +
  '    }',

  '    async function fsGetAllSafe(storeName, bypassCache = false) {\n' +
  '      const masterStores = (typeof MASTER_DATA_STORES !== \'undefined\') ? MASTER_DATA_STORES : (typeof window !== \'undefined\' && window.MASTER_DATA_STORES ? window.MASTER_DATA_STORES : null);\n' +
  '      const memCache = (typeof _masterDataMemoryCache !== \'undefined\') ? _masterDataMemoryCache : (typeof window !== \'undefined\' && window._masterDataMemoryCache ? window._masterDataMemoryCache : null);\n' +
  '      const ttl = (typeof MASTER_DATA_CACHE_TTL_MS !== \'undefined\') ? MASTER_DATA_CACHE_TTL_MS : 60000;\n\n' +
  '      if (!bypassCache && masterStores && masterStores.has(storeName) && memCache) {\n' +
  '        const cached = memCache.get(storeName);\n' +
  '        if (cached && (Date.now() - cached.timestamp < ttl)) {\n' +
  '          return JSON.parse(JSON.stringify(cached.data));\n' +
  '        }\n' +
  '      }\n\n' +
  '      try {\n' +
  '        const user = getCurrentFirebaseUser();\n' +
  '        if (user) {\n' +
  '          const db = getFirestoreDb();\n' +
  '          if (db) {\n' +
  '            const snap = await db.collection(storeName).get();\n' +
  '            const records = [];\n' +
  '            snap.forEach(doc => {\n' +
  '              const data = doc.data();\n' +
  '              const legacyId = (data.legacyId !== undefined && data.legacyId !== null)\n' +
  '                ? data.legacyId\n' +
  '                : (data.id !== undefined ? data.id : doc.id);\n' +
  '              records.push({\n' +
  '                ...data,\n' +
  '                firestoreId: doc.id,\n' +
  '                id: legacyId\n' +
  '              });\n' +
  '            });\n\n' +
  '            if (typeof trackFirestoreReads === \'function\') {\n' +
  '              trackFirestoreReads(storeName, snap.docs ? snap.docs.length : (snap.size || 0), \'fsGetAllSafe\');\n' +
  '            }\n\n' +
  '            if (masterStores && masterStores.has(storeName) && memCache) {\n' +
  '              memCache.set(storeName, {\n' +
  '                data: JSON.parse(JSON.stringify(records)),\n' +
  '                timestamp: Date.now()\n' +
  '              });\n' +
  '            }\n\n' +
  '            // Background cache synchronization to IndexedDB: ensure cache mirrors authoritative Firestore\n' +
  '            if (typeof clearStore === \'function\' && typeof putRec === \'function\') {\n' +
  '              try {\n' +
  '                await clearStore(storeName);\n' +
  '                for (const rec of records) {\n' +
  '                  await putRec(storeName, rec);\n' +
  '                }\n' +
  '              } catch (cacheErr) {\n' +
  '                console.warn(`[Repository] Background cache update skipped for ${storeName}:`, cacheErr);\n' +
  '              }\n' +
  '            }\n\n' +
  '            return records;\n' +
  '          }\n' +
  '        }\n' +
  '      } catch (err) {\n' +
  '        console.warn(`[Repository] Firestore read failed for ${storeName}; using IndexedDB cache fallback:`, err);\n' +
  '      }\n\n' +
  '      // Fallback to IndexedDB cache\n' +
  '      if (typeof getAll === \'function\') {\n' +
  '        return await getAll(storeName);\n' +
  '      }\n' +
  '      return [];\n' +
  '    }',
  '11. fsGetAllSafe Master Data In-Memory Caching & Telemetry'
);

// 12a. Master Data Invalidation in fsSaveRecordSafe
replaceExact(
  '      // 2. On confirmed Firestore success, update IndexedDB cache\n' +
  '      if (typeof putRec === \'function\') {\n' +
  '        try {\n' +
  '          await putRec(storeName, { ...payload, id: record.id || record.legacyId || docId });\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Warning caching to IndexedDB (${storeName}):`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      return docId;',

  '      // 2. On confirmed Firestore success, update IndexedDB cache\n' +
  '      if (typeof putRec === \'function\') {\n' +
  '        try {\n' +
  '          await putRec(storeName, { ...payload, id: record.id || record.legacyId || docId });\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Warning caching to IndexedDB (${storeName}):`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      if (isMasterStore && typeof invalidateMasterDataCache === \'function\') {\n' +
  '        invalidateMasterDataCache(storeName);\n' +
  '      }\n\n' +
  '      return docId;',
  '12a. Master Data Invalidation in fsSaveRecordSafe'
);

// 12b. Master Data Invalidation in fsUpdateRecordSafe
replaceExact(
  '          if (targetId !== id && typeof id === \'string\' && id.includes(\'_\')) {\n' +
  '            try { await putRec(storeName, { ...cached, ...payload, id: id }); } catch (_) {}\n' +
  '          }\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Cache update warning for ${storeName}/${id}:`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      return docId;',

  '          if (targetId !== id && typeof id === \'string\' && id.includes(\'_\')) {\n' +
  '            try { await putRec(storeName, { ...cached, ...payload, id: id }); } catch (_) {}\n' +
  '          }\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Cache update warning for ${storeName}/${id}:`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      if (isMasterStore && typeof invalidateMasterDataCache === \'function\') {\n' +
  '        invalidateMasterDataCache(storeName);\n' +
  '      }\n\n' +
  '      return docId;',
  '12b. Master Data Invalidation in fsUpdateRecordSafe'
);

// 12c. Master Data Invalidation in fsDeleteRecordSafe
replaceExact(
  '      // 2. On confirmed success, remove from IndexedDB cache\n' +
  '      if (typeof deleteRec === \'function\') {\n' +
  '        try {\n' +
  '          await deleteRec(storeName, id);\n' +
  '          const numId = (typeof id === \'string\' && id.includes(\'_\')) ? parseInt(id.split(\'_\')[1], 10) : parseInt(id, 10);\n' +
  '          if (!isNaN(numId) && numId !== id) {\n' +
  '            await deleteRec(storeName, numId);\n' +
  '          }\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Cache delete warning for ${storeName}/${id}:`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      return true;',

  '      // 2. On confirmed success, remove from IndexedDB cache\n' +
  '      if (typeof deleteRec === \'function\') {\n' +
  '        try {\n' +
  '          await deleteRec(storeName, id);\n' +
  '          const numId = (typeof id === \'string\' && id.includes(\'_\')) ? parseInt(id.split(\'_\')[1], 10) : parseInt(id, 10);\n' +
  '          if (!isNaN(numId) && numId !== id) {\n' +
  '            await deleteRec(storeName, numId);\n' +
  '          }\n' +
  '        } catch (cacheErr) {\n' +
  '          console.warn(`[Repository] Cache delete warning for ${storeName}/${id}:`, cacheErr);\n' +
  '        }\n' +
  '      }\n\n' +
  '      if ([\'funds\', \'bankAccounts\', \'incomeCategories\', \'expenseCategories\'].includes(storeName) && typeof invalidateMasterDataCache === \'function\') {\n' +
  '        invalidateMasterDataCache(storeName);\n' +
  '      }\n\n' +
  '      return true;',
  '12c. Master Data Invalidation in fsDeleteRecordSafe'
);

// 13a. Telemetry in fsGetOneSafe
replaceExact(
  '            if (docSnap && docSnap.exists) {\n' +
  '              const data = docSnap.data();',

  '            if (docSnap && docSnap.exists) {\n' +
  '              if (typeof trackFirestoreReads === \'function\') trackFirestoreReads(storeName, 1, \'fsGetOneSafe\');\n' +
  '              const data = docSnap.data();',
  '13a. Telemetry in fsGetOneSafe'
);

// 13b. Telemetry in fsGetCounters
replaceExact(
  '    async function fsGetCounters() {\n' +
  '      try {\n' +
  '        const db = getFirestoreDb();\n' +
  '        if (!db) return null;\n' +
  '        const snap = await getFsCountersDocRef().get();\n' +
  '        return snap.exists ? snap.data() : null;',

  '    async function fsGetCounters() {\n' +
  '      try {\n' +
  '        const db = getFirestoreDb();\n' +
  '        if (!db) return null;\n' +
  '        const snap = await getFsCountersDocRef().get();\n' +
  '        if (typeof trackFirestoreReads === \'function\') trackFirestoreReads(\'system/counters\', 1, \'fsGetCounters\');\n' +
  '        return snap.exists ? snap.data() : null;',
  '13b. Telemetry in fsGetCounters'
);

// 14. Global window exports
replaceExact(
  '    window.isFirestoreQuotaExceeded = isFirestoreQuotaExceeded;\n' +
  '    window.isBrowserStorageQuotaExceeded = isBrowserStorageQuotaExceeded;\n' +
  '    window.saveReceipt = saveReceipt;',

  '    window.isFirestoreQuotaExceeded = isFirestoreQuotaExceeded;\n' +
  '    window.isBrowserStorageQuotaExceeded = isBrowserStorageQuotaExceeded;\n' +
  '    window.saveReceipt = saveReceipt;\n' +
  '    window.validateManualBillNoInput = validateManualBillNoInput;\n' +
  '    window.onManualBillNoInput = onManualBillNoInput;\n' +
  '    window.getOccupiedBillingSequenceNumbers = getOccupiedBillingSequenceNumbers;\n' +
  '    window.getNextAvailableBillingSeq = getNextAvailableBillingSeq;\n' +
  '    window.getNextBillingReceiptNo = getNextBillingReceiptNo;\n' +
  '    window.fsNextBillingReceiptNo = fsNextBillingReceiptNo;\n' +
  '    window.getCashBalance = getCashBalance;\n' +
  '    window.getBankBalance = getBankBalance;\n' +
  '    window.getFundBalance = getFundBalance;\n' +
  '    window.getAllFundBalances = getAllFundBalances;\n' +
  '    window.getLoanOutstanding = getLoanOutstanding;\n' +
  '    window.getChittyOutstanding = getChittyOutstanding;\n' +
  '    window.monthIncomeExpense = monthIncomeExpense;\n' +
  '    window.invalidateMasterDataCache = invalidateMasterDataCache;\n' +
  '    window.getFirestoreReadMetrics = getFirestoreReadMetrics;\n' +
  '    window.resetFirestoreReadMetrics = resetFirestoreReadMetrics;\n' +
  '    window.trackFirestoreReads = trackFirestoreReads;',
  '14. Global window exports'
);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully wrote updated Temple_Accounts-1.html!');
