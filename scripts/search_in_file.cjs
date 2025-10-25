const fs = require('fs');
const file = process.argv[2];
const pattern = process.argv.slice(3).join(' ');
if (!file || !pattern) {
  console.error('Usage: node scripts/search_in_file.cjs <file> <pattern>');
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
const idxs = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(pattern)) idxs.push(i + 1);
}
console.log('Matches:', idxs.slice(0,50).join(', '), idxs.length > 50 ? `(+${idxs.length-50} more)` : '');
if (idxs.length) {
  const i = idxs[0];
  const start = Math.max(1, i - 20);
  const end = Math.min(lines.length, i + 60);
  for (let n = start; n <= end; n++) {
    console.log(n + ': ' + lines[n - 1]);
  }
}

