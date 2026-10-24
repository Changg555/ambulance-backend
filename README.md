# ⚙️ KPS Ambulance Backend
### ระบบเซิร์ฟเวอร์หลังบ้าน OTP & Authentication Microservice

เซิร์ฟเวอร์หลังบ้านพัฒนาด้วย **Node.js + Express + Firebase Admin SDK + Nodemailer** ทำหน้าที่เป็นตัวกลางด้านความปลอดภัยสำหรับการยืนยันตัวตนผู้ใช้งาน, จัดส่งรหัสผ่านใช้ครั้งเดียว (**OTP 6 หลัก**) ทางอีเมล และทำงานร่วมกับ Firebase Cloud Firestore แบบ Real-time Queue Worker

---

## 🌟 ฟีเจอร์เด่น (Key Features)

### 1. ✉️ ระบบจัดส่งรหัส OTP ผ่าน Gmail SMTP (Nodemailer)
- ส่งรหัส OTP 6 หลักไปยังอีเมลของผู้ใช้งาน เพื่อยืนยันตัวตนตอนลงทะเบียน
- มี **HTML Email Template** ที่สวยงาม มีมิติ ตอบสนองทุกขนาดหน้าจอ (Responsive) พร้อมกล่องรหัสตัวหนาชัดเจน ป้ายเตือนเวลาหมดอายุ และข้อความเตือนความปลอดภัย

### 2. 📡 สถาปัตยกรรมทำงานแบบ 2 ระบบ (Dual-Mode Architecture)
- **Mode 1: REST API Endpoints**:
  - `POST /api/auth/send-otp`: สุ่มรหัส ➔ บันทึกลง Firestore `otp_verifications` ➔ ส่งอีเมล
  - `POST /api/auth/verify-otp`: ตรวจสอบความถูกต้องและเวลาหมดอายุของรหัส OTP
  - `GET /health`: ตรวจสอบสถานะการทำงานของเซิร์ฟเวอร์
- **Mode 2: Real-time Firestore Queue Worker (`startOtpFirestoreListener`)**:
  - ดักฟังคิวคำขอใน Firestore คอลเลกชัน `otp_requests` อัตโนมัติ
  - รองรับแอปพลิเคชันมือถือที่รันอยู่บนอุปกรณ์จริง หรือติดปัญหา Firewall/Private IP ให้สามารถขอ OTP ผ่านการเขียน Firestore ได้โดยตรงโดยไม่ต้องเชื่อมต่อ HTTP มายังเซิร์ฟเวอร์

### 3. 🛡️ ความปลอดภัยขั้นสูง (Security Hardening)
- **สุ่มตัวเลขแบบ Cryptographic**: ใช้ `crypto.randomInt(100000, 1000000)` ป้องกันการคาดเดารหัส
- **ป้องกัน Timing Attack**: ใช้ `crypto.timingSafeEqual()` ในการเปรียบเทียบรหัส OTP
- **Rate Limiting**: จำกัดคำขอไม่เกิน 10 ครั้งต่อ IP ภายใน 15 นาที เพื่อป้องกันการยิงสแปม
- **อายุรหัส (TTL)**: รหัสมีอายุ 5 นาที และลบทิ้งทันทีหลังตรวจสอบสำเร็จ (One-Time-Use)

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Runtime**: Node.js
- **Web Framework**: Express.js (4.21)
- **Database & Cloud**: Firebase Admin SDK (13.0)
- **Email Service**: Nodemailer (6.10) with Gmail App Password
- **Security & Utilities**: `express-rate-limit`, `cors`, `dotenv`, Native Node.js `crypto`

---

## 🚀 การติดตั้งและเริ่มใช้งาน (Getting Started)

### 1. โคลนโปรเจกต์
```bash
git clone https://github.com/Changg555/ambulance-backend.git
cd ambulance-backend
```

### 2. ติดตั้ง Dependencies
```bash
npm install
```

### 3. วางไฟล์กุญแจลับ Firebase Admin
- ดาวน์โหลดกุญแจบริการ **Service Account Key** จาก Firebase Console (Project Settings ➔ Service accounts ➔ Generate new private key)
- นำไฟล์มาวางที่โฟลเดอร์ราก (Root) และตั้งชื่อเป็น `serviceAccountKey.json`
*(ไฟล์นี้ถูกระบุใน `.gitignore` แล้ว จะไม่หลุดขึ้น Git)*

### 4. ตั้งค่า Environment Variables
สร้างไฟล์ `.env` ที่โฟลเดอร์ราก (Root) และระบุข้อมูล:
```env
PORT=5000
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_digit_app_password
```
*(สร้าง App Password ได้ที่: Google Account ➔ Security ➔ 2-Step Verification ➔ App passwords)*

### 5. สั่งรันเซิร์ฟเวอร์
```bash
# รันโหมดปกติ
npm start

# รันโหมด Development (ตรวจจับการแก้ไขไฟล์อัตโนมัติ)
npm run dev
```
เซิร์ฟเวอร์จะเริ่มทำงานที่ `http://localhost:5000` พร้อมเริ่มดักฟังคิว `otp_requests` แบบ Real-time ทันที

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
ambulance_backend/
├── config/
│   └── firebase.js          # Initialise Firebase Admin SDK ด้วย Service Account
├── routes/
│   └── authRoutes.js        # API รับ-ส่ง OTP และฟังก์ชัน Firestore Queue Listener
├── utils/
│   └── mailer.js            # Nodemailer Transporter และ HTML Template
├── .env                     # ตัวแปรระบบ (พอร์ต, รหัสผ่านอีเมล)
├── package.json
├── server.js                # Express Server Entry Point
└── serviceAccountKey.json   # กุญแจลับ Firebase Admin
```

---

## 📄 License
ระบบนี้จัดทำขึ้นเพื่อการศึกษาและการปฏิบัติการช่วยเหลือฉุกเฉิน มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตกำแพงแสน
