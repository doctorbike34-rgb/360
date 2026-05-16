export const fileToBase64 = async (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const run = async () => {

    try {
      if (typeof window !== 'undefined' && 'FileReader' in window && typeof FileReader === 'function') {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(file);
        return;
      }
    } catch (e) {
      console.warn('FileReader fallback', e);
    }

    try {
      // Fallback 1: Response / arrayBuffer
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binary = bytes.reduce((data, byte) => data + String.fromCharCode(byte), '');
      const base64 = btoa(binary);
      resolve(`data:${file.type};base64,${base64}`);
    } catch (e: any) {
      reject(new Error('Impossibile convertire: ' + e.message));
    }
    };
    run();
  });
};
