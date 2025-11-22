// server.js - Express + static frontend
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const api = require('./routes/api');
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', api);
app.get('/health', (req, res) => res.json({status:'ok'}));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'portal.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('AMDI Render server started on', PORT));
