const fs = require('fs');
const path = process.argv[2];
const start = parseInt(process.argv[3], 10);
const end = parseInt(process.argv[4], 10);
if (!path || !Number.isFinite(start) || !Number.isFinite(end)) {
  console.error('Usage: node scripts/print_lines.cjs <file> <start> <end>');
  process.exit(1);
}
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = start; i <= end && i <= lines.length; i++) {
  console.log(i + ': ' + lines[i - 1]);
}

