const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { admin, db } = require('../config/firebase');
const { sendOtpEmail } = require('../utils/mailer');

const router = express.Router();

// จำกัดจำนวนครั้งเพื่อป้องกันการยิงสแปมหรือสุ่มรหัส OTP
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 10, // สูงสุด 10 ครั้งต่อ IP ใน 15 นาที
  message: {
    success: false,
    message: 'คุณทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
  },
});

const normalizeAndValidateEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const cleaned = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
};

// ฟังก์ชันหลักสำหรับสร้างและส่ง OTP ทางอีเมล
const processSendOtp = async (rawEmail) => {
  const email = normalizeAndValidateEmail(rawEmail);

  if (!email) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
      },
    };
  }

  // สุ่มตัวเลข OTP 6 หลักอย่างปลอดภัย
  const otp = crypto.randomInt(100000, 1000000).toString();

  const now = Date.now();
  const expiresAtMs = now + 5 * 60 * 1000; // หมดอายุใน 5 นาที

  const createdAt = admin.firestore.Timestamp.fromMillis(now);
  const expiresAt = admin.firestore.Timestamp.fromMillis(expiresAtMs);

  // บันทึกลง Firestore collection 'otp_verifications' โดยใช้ email เป็น Document ID
  await db.collection('otp_verifications').doc(email).set({
    otp,
    createdAt,
    expiresAt,
  });

  // ส่งอีเมลแจ้งรหัสผ่าน Nodemailer
  await sendOtpEmail(email, otp);

  return {
    status: 200,
    body: {
      success: true,
      message: 'ส่งรหัส OTP ไปยังอีเมลของคุณเรียบร้อยแล้ว (รหัสมีอายุ 5 นาที)',
    },
  };
};

// ฟังก์ชันหลักสำหรับตรวจสอบรหัส OTP
const processVerifyOtp = async (rawEmail, rawOtp) => {
  const email = normalizeAndValidateEmail(rawEmail);
  const otpInput =
    typeof rawOtp === 'string' || typeof rawOtp === 'number'
      ? String(rawOtp).trim()
      : '';

  if (!email || !/^\d{6}$/.test(otpInput)) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'กรุณาระบุอีเมลและรหัส OTP 6 หลักให้ครบถ้วน',
      },
    };
  }

  const docRef = db.collection('otp_verifications').doc(email);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'ไม่พบข้อมูลรหัส OTP สำหรับอีเมลนี้ หรือรหัสถูกใช้งานไปแล้ว กรุณาขอรหัสใหม่',
      },
    };
  }

  const data = docSnap.data();

  const expiresAtMillis = data.expiresAt?.toMillis
    ? data.expiresAt.toMillis()
    : new Date(data.expiresAt).getTime();

  if (Date.now() > expiresAtMillis) {
    await docRef.delete();
    return {
      status: 400,
      body: {
        success: false,
        message: 'รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่',
      },
    };
  }

  const storedOtpBuffer = Buffer.from(String(data.otp));
  const inputOtpBuffer = Buffer.from(otpInput);
  const isMatch =
    storedOtpBuffer.length === inputOtpBuffer.length &&
    crypto.timingSafeEqual(storedOtpBuffer, inputOtpBuffer);

  if (!isMatch) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง',
      },
    };
  }

  await docRef.delete();

  return {
    status: 200,
    body: {
      success: true,
    },
  };
};

// 1. POST /api/auth/send-otp
router.post('/send-otp', otpRateLimiter, async (req, res) => {
  try {
    const result = await processSendOtp(req.body.email);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error in POST /api/auth/send-otp:', error);
    return res.status(500).json({
      success: false,
      message: 'ไม่สามารถส่งรหัส OTP ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    });
  }
});

// 2. POST /api/auth/verify-otp
router.post('/verify-otp', otpRateLimiter, async (req, res) => {
  try {
    const result = await processVerifyOtp(req.body.email, req.body.otp);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error in POST /api/auth/verify-otp:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP กรุณาลองใหม่อีกครั้ง',
    });
  }
});

// 3. Firestore Realtime Queue Listener (รองรับทั้งแอปมือถือจริงและเว็บโดยไม่ติด Firewall/IP)
const startOtpFirestoreListener = () => {
  const processingIds = new Set();

  db.collection('otp_requests')
    .where('status', '==', 'pending')
    .onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const docSnap = change.doc;
          const docId = docSnap.id;
          if (processingIds.has(docId)) return;
          processingIds.add(docId);

          const data = docSnap.data() || {};
          try {
            let result;
            if (data.action === 'send-otp') {
              result = await processSendOtp(data.email);
            } else if (data.action === 'verify-otp') {
              result = await processVerifyOtp(data.email, data.otp);
            } else {
              result = {
                status: 400,
                body: { success: false, message: 'คำขอไม่ถูกต้อง' },
              };
            }

            await docSnap.ref.update({
              status: result.body.success ? 'completed' : 'failed',
              success: Boolean(result.body.success),
              message: result.body.message || '',
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (error) {
            console.error('Error processing otp_requests doc:', docId, error);
            try {
              await docSnap.ref.update({
                status: 'failed',
                success: false,
                message: 'ไม่สามารถดำเนินการรหัส OTP ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (_) {}
          } finally {
            processingIds.delete(docId);
          }
        });
      },
      (err) => {
        console.error('Firestore otp_requests listener error:', err);
      }
    );

  console.log('📡 Firestore OTP Queue Listener active (collection: otp_requests)');
};

module.exports = router;
module.exports.startOtpFirestoreListener = startOtpFirestoreListener;
