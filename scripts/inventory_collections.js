const fs = require('fs');

const content = fs.readFileSync('Temple_Accounts-1.html', 'utf8');

// Regex to find db.collection('...') or db.collection("...")
const regexDirect = /\b(?:db|fs|firestore)\.collection\(\s*['"]([^'"]+)['"]\s*\)/g;
const directCollections = new Set();
let match;
while ((match = regexDirect.exec(content)) !== null) {
  directCollections.add(match[1]);
}

// Check doc references: db.doc('...')
const regexDoc = /\b(?:db|fs|firestore)\.doc\(\s*['"]([^'"]+)['"]\s*\)/g;
const directDocs = new Set();
while ((match = regexDoc.exec(content)) !== null) {
  directDocs.add(match[1]);
}

// Search for collection arrays / definitions (e.g. ALL_COLLECTIONS, COLLECTIONS, etc.)
const regexArrays = /(?:const|let|var)\s+([A-Za-z0-9_$]*(?:COLLECTION|Collection|TABLE|Table)[A-Za-z0-9_$]*)\s*=\s*\[([^\]]+)\]/g;
const definedArrays = [];
while ((match = regexArrays.exec(content)) !== null) {
  definedArrays.push({ name: match[1], items: match[2] });
}

console.log('=== DIRECT COLLECTIONS IN CODE ===');
console.log([...directCollections].sort());

console.log('\n=== DIRECT DOC PATHS IN CODE ===');
console.log([...directDocs].sort());

console.log('\n=== DEFINED COLLECTION ARRAYS ===');
console.log(definedArrays);
