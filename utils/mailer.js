const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const buildOtpEmailHtml = (otp) => `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #d32f2f; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">
                🚑 ระบบแจ้งเหตุและจัดการรถพยาบาลฉุกเฉิน
              </h1>
              <p style="margin: 4px 0 0; color: #ffcdd2; font-size: 13px;">
                Ambulance Emergency System
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px; color: #333333;">
              <p style="margin: 0 0 16px; font-size: 16px;">สวัสดีครับ,</p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #555555;">
                คุณได้ทำการร้องขอรหัสยืนยันตัวตน (OTP) สำหรับเข้าใช้งานระบบ กรุณานำรหัส 6 หลักด้านล่างนี้ไปกรอกในแอปพลิเคชันหรือเว็บไซต์:
              </p>

              <!-- OTP Box -->
              <div style="background-color: #fef2f2; border: 2px dashed #ef4444; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #b91c1c; font-family: monospace;">
                  ${otp}
                </span>
                <p style="margin: 8px 0 0; font-size: 13px; color: #dc2626;">
                  ⏳ รหัสนี้จะหมดอายุภายใน <strong>5 นาที</strong>
                </p>
              </div>

              <!-- Security Warning -->
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 4px; margin-bottom: 16px;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400e;">
                  <strong>⚠️ คำเตือนด้านความปลอดภัย:</strong><br/>
                  ห้ามเปิดเผยรหัส OTP นี้แก่บุคคลอื่นโดยเด็ดขาด เจ้าหน้าที่หรือผู้ดูแลระบบจะไม่มีการติดต่อเพื่อขอรหัสนี้จากคุณ หากคุณไม่ได้เป็นผู้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้ทันที
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ<br/>
                &copy; ${new Date().getFullYear()} Ambulance Emergency System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const sendOtpEmail = async (toEmail, otp) => {
  await transporter.sendMail({
    from: `"Ambulance Emergency System" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `[${otp}] รหัสยืนยันตัวตน (OTP) - ระบบแจ้งเหตุรถพยาบาลฉุกเฉิน`,
    html: buildOtpEmailHtml(otp),
  });
};

module.exports = { sendOtpEmail, buildOtpEmailHtml };
