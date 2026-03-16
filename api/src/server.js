require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const balanceRoute = require('./routes/balance');
const gamesRoute = require('./routes/games');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Casino API running' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use('/balance', balanceRoute);
app.use('/games', gamesRoute);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, HOST, () => {
      console.log(`API listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Mongo connection error:', err);
  });