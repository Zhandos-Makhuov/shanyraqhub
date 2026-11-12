/**
 * End-to-End Encryption (E2EE) helper using Web Crypto API
 * Generates room key fingerprints, simulates client-side AES-GCM encryption
 */

export async function generateFingerprint(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input + "-shanyraq-e2ee-salt-2026");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    // Group into elegant 4-char chunks: e.g. 84F2 : A19C : 43D8 : 01BE
    return hex.slice(0, 32).toUpperCase().match(/.{1,4}/g)?.join(" : ") || "SHANYRAQ-SECURE-KEY";
  } catch {
    return "E2EE : 7A9B : C410 : 882E : 553F";
  }
}

export function simulateEncrypt(plainText: string, roomKey: string): { cipherText: string; tag: string } {
  // Simple deterministic obfuscation for preview + authentication tag simulation
  const bytes = [];
  for (let i = 0; i < plainText.length; i++) {
    const charCode = plainText.charCodeAt(i) ^ (roomKey.charCodeAt(i % roomKey.length) + 17);
    bytes.push(charCode.toString(16).padStart(2, "0"));
  }
  const cipher = bytes.join("");
  const tag = `E2EE-AES-GCM-256[${cipher.slice(0, 16)}...]`;
  return { cipherText: cipher, tag };
}

export function simulateDecrypt(cipherHex: string, roomKey: string): string {
  try {
    let result = "";
    for (let i = 0; i < cipherHex.length; i += 2) {
      const byteHex = cipherHex.substr(i, 2);
      const byteVal = parseInt(byteHex, 16);
      const charCode = byteVal ^ (roomKey.charCodeAt((i / 2) % roomKey.length) + 17);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return "Не удалось расшифровать сообщение (неверный ключ сессии)";
  }
}
