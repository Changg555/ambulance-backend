const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const { startOtpFirestoreListener } = require('./routes/authRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/idcard', require('./routes/idcardRoutes'));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'ambulance_backend' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚑 Ambulance Backend Server running on http://0.0.0.0:${PORT}`);
  startOtpFirestoreListener();
});
