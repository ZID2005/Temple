const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

const cssBlock = htmlContent.match(/\/\* ===================== STEP 33\.113: RANGOLI WELCOME SCREEN ===================== \*\/[\s\S]*?(?=\/\* ===================== STEP 22: BRANDED AUTH)/)[0];
const htmlBlock = htmlContent.match(/<!-- ===================== STEP 33\.113: RANGOLI WELCOME SCREEN ===================== -->[\s\S]*?(?=<!-- ===================== STEP 22: BRANDED AUTH)/)[0];
const jsBlock = htmlContent.match(/\/\* ===================== STEP 33\.113: RANGOLI PRELOADER =====================[\s\S]*?(?=\/\* ===================== AUTH & SPLASH EXPERIENCE COORDINATOR)/)[0];

const harnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
  <meta charset="UTF-8">
  <title>Rangoli Welcome Test Harness</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
${cssBlock}
  </style>
</head>
<body>
${htmlBlock}
  <script>
${jsBlock}
    window.addEventListener('DOMContentLoaded', () => {
      RangoliPreloader.init({});
      // Trigger rush to reach completed hold state cleanly
      const root = document.getElementById('rangoli-welcome');
      if (root) root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(PROJECT_DIR, 'tests', 'step_33_113_visual_harness.html'), harnessHtml, 'utf8');

// 1. Desktop screenshot (1280x800) at 2500ms hold state
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=1280,800 --virtual-time-budget=2500 "--screenshot=D:\\Temple\\tests\\step_33_113_desktop_rangoli.png" "file:///D:/Temple/tests/step_33_113_visual_harness.html"`);

// 2. Mobile screenshot (375x667) at 2500ms hold state
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=375,667 --virtual-time-budget=2500 "--screenshot=D:\\Temple\\tests\\step_33_113_mobile_rangoli.png" "file:///D:/Temple/tests/step_33_113_visual_harness.html"`);

console.log('Screenshots generated successfully at hold phase.');
