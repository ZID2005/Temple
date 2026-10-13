const fs = require('fs');
const lines = fs.readFileSync('C:/Users/sanal/.gemini/antigravity-ide/brain/40d544de-1cd8-4d8e-8e6c-20c61206e5a4/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'BROWSER_SUBAGENT') {
      console.log('BROWSER_SUBAGENT step:', obj.step_index);
      console.log(obj.content ? obj.content.slice(0, 800) : 'no content');
    }
  } catch(e) {}
}
