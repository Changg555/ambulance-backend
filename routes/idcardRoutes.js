const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const nacl = require('tweetnacl');
const { admin, db } = require('../config/firebase');
const { sendOtpEmail } = require('../utils/mailer');

const router = express.Router();

const OTP_TTL_MS = 5 * 60 * 1000; // OTP อายุ 5 นาที
const MAX_ATTEMPTS = 5;           // กรอกผิดได้ไม่เกิน 5 ครั้ง

// private key สำหรับถอดรหัส (อ่านจาก .env)
const secretKey = process.env.IDCARD_SECRET_KEY_B64
  ? new Uint8Array(Buffer.from(process.env.IDCARD_SECRET_KEY_B64, 'base64'))
  : null;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'ทำรายการบ่อยเกินไป กรุณารอสักครู่' },
});

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');
const maskEmail = (email) => email.replace(/(.{2}).*(@.*)/, '$1***$2');
const fromBase64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));

// ---------- Middleware: ต้องเป็น Admin ที่ล็อกอินอยู่เท่านั้น ----------
async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลการเข้าสู่ระบบ' });
    }

    const decoded = await admin.auth().verifyIdToken(token); // ตรวจว่า token จริง
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;

    const isAdmin = user && user.role === 'admin' && user.active !== false;
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้น' });
    }

    req.adminUser = { uid: decoded.uid, email: decoded.email || user.email };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'การเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ' });
  }
}

// ---------- 1) ขอ OTP ----------
router.post('/request-otp', limiter, requireAdmin, async (req, res) => {
  try {
    const { targetUid } = req.body;
    if (!targetUid || typeof targetUid !== 'string') {
      return res.status(400).json({ success: false, message: 'ไม่พบรหัสผู้ใช้ที่ต้องการดู' });
    }
    if (!req.adminUser.email) {
      return res.status(400).json({ success: false, message: 'บัญชีนี้ไม่มีอีเมลสำหรับรับ OTP' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    // เก็บเฉพาะ hash ของ OTP (ไม่เก็บตัวเลขจริง) ใช้ uid ของ admin เป็น doc id
    await db.collection('idcard_otps').doc(req.adminUser.uid).set({
      otpHash: hashOtp(otp),
      targetUid,
      attempts: 0,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
    });

    await sendOtpEmail(req.adminUser.email, otp);

    return res.json({ success: true, sentTo: maskEmail(req.adminUser.email) });
  } catch (error) {
    console.error('request-otp error:', error);
    return res.status(500).json({ success: false, message: 'ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่' });
  }
});

// ---------- 2) ยืนยัน OTP แล้วถอดรหัส ----------
router.post('/decrypt', limiter, requireAdmin, async (req, res) => {
  try {
    if (!secretKey) {
      return res.status(500).json({ success: false, message: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าคีย์ถอดรหัส' });
    }

    const { targetUid, incidentId, otp } = req.body;
    if (!targetUid || !/^\d{6}$/.test(String(otp || ''))) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ OTP 6 หลักให้ถูกต้อง' });
    }

    const otpRef = db.collection('idcard_otps').doc(req.adminUser.uid);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบ OTP กรุณากดขอ OTP ใหม่' });
    }
    const otpData = otpSnap.data();

    if (Date.now() > otpData.expiresAt.toMillis()) {
      await otpRef.delete();
      return res.status(400).json({ success: false, message: 'OTP หมดอายุแล้ว กรุณาขอใหม่' });
    }
    if (otpData.targetUid !== targetUid) {
      return res.status(400).json({ success: false, message: 'OTP นี้ใช้กับผู้แจ้งเหตุรายอื่น' });
    }
    if (otpData.attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return res.status(429).json({ success: false, message: 'กรอกผิดเกินกำหนด กรุณาขอ OTP ใหม่' });
    }

    // เทียบ hash แบบกัน timing attack
    const inputHash = Buffer.from(hashOtp(String(otp)));
    const savedHash = Buffer.from(otpData.otpHash);
    const isMatch = crypto.timingSafeEqual(inputHash, savedHash);

    if (!isMatch) {
      await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(400).json({ success: false, message: 'OTP ไม่ถูกต้อง' });
    }

    await otpRef.delete(); // OTP ใช้ได้ครั้งเดียว

    // ดึงข้อมูลที่เข้ารหัสแล้วมาถอด
    const privateSnap = await db.collection('users_private').doc(targetUid).get();
    const sealed = privateSnap.exists ? privateSnap.data().idcardSealed : null;
    if (!sealed || !sealed.ct || !sealed.nonce || !sealed.epk) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเลขบัตรที่เข้ารหัสไว้' });
    }

    const plain = nacl.box.open(
      fromBase64(sealed.ct),
      fromBase64(sealed.nonce),
      fromBase64(sealed.epk),
      secretKey
    );
    if (!plain) {
      return res.status(500).json({ success: false, message: 'ถอดรหัสไม่สำเร็จ (คีย์ไม่ตรงกับข้อมูล)' });
    }

    // บันทึก Audit Log จากฝั่งเซิร์ฟเวอร์
    await db.collection('idcard_audit').add({
      adminUid: req.adminUser.uid,
      adminEmail: req.adminUser.email || null,
      targetUid,
      incidentId: incidentId || null,
      method: 'otp',
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, idcard: Buffer.from(plain).toString('utf8') });
  } catch (error) {
    console.error('decrypt error:', error);
    return res.status(500).json({ success: false, message: 'ถอดรหัสไม่สำเร็จ กรุณาลองใหม่' });
  }
});

module.exports = router;