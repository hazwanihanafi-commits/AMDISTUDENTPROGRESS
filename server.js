// server.js - Express + static frontend (ESM version)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import api from './routes/api.js';
import { fileURLToPath } from 'url';

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', api);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Frontend fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// Render port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('AMDI Render server started on', PORT));
