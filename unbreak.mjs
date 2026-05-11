import fs from 'fs';
let content = fs.readFileSync('src/components/TransactionsModal.tsx', 'utf8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync('src/components/TransactionsModal.tsx', content);
