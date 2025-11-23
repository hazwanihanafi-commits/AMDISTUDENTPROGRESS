// server.js (ESM)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve public folder
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);
app.use('/api', adminRoutes);

// health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// fallback to portal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('AMDI server running on', PORT));
