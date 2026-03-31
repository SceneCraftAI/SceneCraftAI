import fs from 'fs';
const content = fs.readFileSync('src/translations.ts', 'utf8');
const lines = content.split('\n');
const keys = {};
const duplicates = [];

lines.forEach((line, index) => {
  const match = line.match(/^\s*'([^']+)':/);
  if (match) {
    const key = match[1];
    const lowerKey = key.toLowerCase();
    if (keys[lowerKey]) {
      duplicates.push({ key, firstLine: keys[lowerKey].line, firstKey: keys[lowerKey].key, secondLine: index + 1 });
    } else {
      keys[lowerKey] = { key, line: index + 1 };
    }
  }
});

if (duplicates.length > 0) {
  console.log('Duplicate keys found:');
  duplicates.forEach(d => {
    console.log(`Key: "${d.key}" found at lines ${d.firstLine} and ${d.secondLine}`);
  });
} else {
  console.log('No duplicate keys found.');
}
console.log(`Processed ${Object.keys(keys).length} keys.`);
