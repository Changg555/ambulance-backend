const fs = require('fs');
const crypto = require('crypto');
const nacl = require('tweetnacl');

// วิธีใช้: node scripts/exportKey.js ./idcard-key.enc.json "รหัสผ่านปลดล็อก"
const [, , file, password] = process.argv;
const { salt, nonce, box } = JSON.parse(fs.readFileSync(file, 'utf8'));

// พารามิเตอร์เดียวกับฝั่งเว็บเดิม: N=2^15, r=8, p=1
const dk = crypto.scryptSync(
  Buffer.from(password, 'utf8'),
  Buffer.from(salt, 'base64'),
  32,
  { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
);

const sk = nacl.secretbox.open(
  new Uint8Array(Buffer.from(box, 'base64')),
  new Uint8Array(Buffer.from(nonce, 'base64')),
  new Uint8Array(dk)
);

if (!sk) {
  console.error('รหัสผ่านไม่ถูกต้อง หรือไฟล์คีย์เสียหาย');
  process.exit(1);
}

console.log(Buffer.from(sk).toString('base64'));