const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, '..', 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.js'));

const rootAssets = [
  'firestore.rules.candidate',
  'firestore.rules',
  'firebase.json',
  'Temple_Accounts-1.html'
];

let updatedCount = 0;

files.forEach(f => {
  const filePath = path.join(testsDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  rootAssets.forEach(asset => {
    // Replace: path.join(__dirname, 'asset') or path.join(__dirname, "asset")
    // With: (fs.existsSync(path.join(__dirname, 'asset')) ? path.join(__dirname, 'asset') : path.join(__dirname, '..', 'asset'))
    const singleQuote = `path.join(__dirname, '${asset}')`;
    const doubleQuote = `path.join(__dirname, "${asset}")`;
    const replacement = `(fs.existsSync(path.join(__dirname, '${asset}')) ? path.join(__dirname, '${asset}') : path.join(__dirname, '..', '${asset}'))`;

    if (content.includes(singleQuote)) {
      content = content.split(singleQuote).join(replacement);
    }
    if (content.includes(doubleQuote)) {
      content = content.split(doubleQuote).join(replacement);
    }
  });

  // Also check for direct readFileSync('Temple_Accounts-1.html'...)
  if (content.includes("fs.readFileSync('Temple_Accounts-1.html'")) {
    content = content.split("fs.readFileSync('Temple_Accounts-1.html'").join(
      "fs.readFileSync(fs.existsSync('Temple_Accounts-1.html') ? 'Temple_Accounts-1.html' : path.join(__dirname, '..', 'Temple_Accounts-1.html')"
    );
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated path resolution in tests/${f}`);
    updatedCount++;
  }
});

console.log(`Total test files updated: ${updatedCount}`);
