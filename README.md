# Temple Accounts Management System

A standalone, Firestore-backed financial accounting and receipting system for temple administration.

---

## 📁 Repository Structure

```
Temple/
├── .vscode/               # Workspace editor settings & file nesting configurations
├── backups/               # Historical pre-step snapshot backups (HTML, JSON & Rules)
├── logs/                  # Local emulator execution and debug logs
├── reports/               # Audit, security verification, and implementation reports (Steps 13–33.24)
├── scripts/               # Diagnostic, inspection, and maintenance utilities
├── tests/                 # Automated validation test suites and test results
├── .gitignore             # Git ignore patterns for logs and temporary files
├── firebase.emulator.json # Firebase Local Emulator Suite configuration
├── firebase.json          # Firebase CLI deployment configuration
├── firestore.rules        # Active Cloud Firestore production security rules
├── firestore.rules.candidate # Hardened candidate security rules with idempotency guards
├── LICENSE                # Project license
├── ogl.esm.js             # Local offline WebGL 1.0.11 ESM bundle for UI animations
├── README.md              # Project documentation and architecture guide
├── serve_app.js           # Primary development web server (Port 3000)
├── server.js              # Secondary standalone HTTP web server (Port 3001)
└── Temple_Accounts-1.html # Main single-page web application
```

---

## 🚀 Running the Application

### 1. Launch the Application Server
Run the local HTTP server using Node.js:
```bash
node serve_app.js
```
The application will be accessible at:
- **Direct Link:** [http://localhost:3000/Temple_Accounts-1.html](http://localhost:3000/Temple_Accounts-1.html)
- **Root URL:** [http://localhost:3000/](http://localhost:3000/)

*(Alternatively, use `node server.js` for port 3001).*

### 2. Launching Firebase Local Emulator (Optional / Testing)
To run against the local emulator suite with Auth and Firestore:
```bash
firebase emulators:start --config firebase.emulator.json
```
- **Firestore Emulator:** `127.0.0.1:8080`
- **Auth Emulator:** `127.0.0.1:9099`
- **Emulator UI:** `127.0.0.1:4000`

---

## 🧪 Running Automated Tests

All test suites reside in the `tests/` directory and can be executed from the project root or from within `tests/`:

```bash
# Verify candidate Firestore security rules hardening
node tests/test_step_33_21_candidate_rules_hardening.js

# Verify Cash Book column alignment, payment types, and mathematical balances
node tests/test_step_33_6a_cashbook.js

# Verify Bank Book particulars and fund transfer integrity
node tests/test_step_33_16_bankbook_particulars.js

# Run full idempotency application hardening suite
node tests/test_step_33_22_idempotency_application_hardening.js
```

---

## 📚 Audit & Implementation Reports

Detailed step-by-step audit trails, security analyses, and implementation verification logs are stored in [`reports/`](./reports/):
- `reports/STEP_33_21_CANDIDATE_RULES_HARDENING_REPORT.md`: Security rules hardening with monotonic sequence and idempotency guarantees.
- `reports/STEP_33_22_IDEMPOTENCY_APPLICATION_HARDENING_REPORT.md`: Frontend transactional idempotency and replay protection.
- `reports/STEP_33_23_DYNAMIC_BUTTON_BILLING_INTEGRATION_REPORT.md`: Billing action button dynamic UX integration.
- `reports/STEP_33_24_EXPANDED_BILLING_RECEIPT_PRINTER_REPORT.md`: POS thermal receipt printing animation and expanded billing layout.
