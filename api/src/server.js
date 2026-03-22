require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const balanceRoute = require('./routes/balance');
const gamesRoute = require('./routes/games');

const app = express();
const PORT = process.env.PORT || 4000;

// تعديل CORS للسماح لجميع النطاقات (مهم جداً لديسكورد)
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/ping', (req, res) => res.send('pong')); // لـ UptimeRobot

app.use('/balance', balanceRoute);
app.use('/games', gamesRoute);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`API Running on port ${PORT}`));
  })
  .catch(err => console.error(err));
