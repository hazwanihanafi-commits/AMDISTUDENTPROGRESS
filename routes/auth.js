import express from 'express';
const router = express.Router();


router.get('/login', (req, res) => {
res.sendFile('login.html', { root: './public' });
});


router.post('/login', (req, res) => {
const { username, password } = req.body;
// Simple local authentication for demo — change to your auth
if (username === 'admin' && password === 'admin123') {
return res.redirect('/admin');
}
return res.status(401).send('Invalid credentials');
});


export default router;
