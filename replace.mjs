import fs from 'fs';

const files = [
  'src/components/AdminHome.tsx',
  'src/components/Auth.tsx',
  'src/components/CyclistHome.tsx',
  'src/components/Map.tsx',
  'src/components/MechanicHome.tsx',
  'src/components/Onboarding.tsx',
  'src/components/P2PWalletModal.tsx',
  'src/components/PeerMechanicHome.tsx',
  'src/components/ProfileView.tsx',
  'src/components/ReviewModal.tsx',
  'src/components/RoadReportModal.tsx',
  'src/components/SocialView.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  let hasChanges = false;
  
  if (content.includes('alert(') || content.includes('window.prompt(')) {
    if (!content.includes("from 'react-hot-toast'")) {
      // Find the first line that is not a comment or empty, or just put it after the first import
      const importIndex = content.indexOf('import ');
      if (importIndex !== -1) {
        content = content.slice(0, importIndex) + "import toast from 'react-hot-toast';\n" + content.slice(importIndex);
      } else {
        content = "import toast from 'react-hot-toast';\n" + content;
      }
    }
  }

  // Replace alerts with toast.success or toast.error based on content
  content = content.replace(/alert\((['"`])((?:(?!\1)[^\\]|\\.)*?successo(?:(?!\1)[^\\]|\\.)*?)\1\)/gi, 'toast.success($1$2$1)');
  
  // Replace the remaining alerts with toast.error
  content = content.replace(/alert\(/g, 'toast.error(');

  fs.writeFileSync(file, content);
}
console.log('Done!');
