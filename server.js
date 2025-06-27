const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

const uploadDir = path.join(__dirname, 'uploads');
const logsDir = path.join(__dirname, 'logs');
const voiceLogFile = path.join(logsDir, 'voice_bans.log');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
if (!fs.existsSync(voiceLogFile)) fs.writeFileSync(voiceLogFile, '');

app.use(express.static(uploadDir));
app.use(bodyParser.urlencoded({ extended: true }));

let lastWinners = [];

// 🔼 Upload

function limitLogSize(filePath, maxBytes = 1048576) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > maxBytes) {
            fs.writeFileSync(filePath, '[🧹 Log trimmed due to size limit]\n');
        }
    } catch (err) {
        console.error("⚠️ Log check error:", err);
    }
}




app.post('/upload', multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, uploadDir),
        filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    })
}).single('file'), (req, res) => {
    const uploader = req.body.name || 'Unknown';
    if (!req.file) return res.status(400).send('❌ No file uploaded.');

    fs.writeFileSync(path.join(uploadDir, req.file.filename + '.meta'), uploader);
    res.status(200).send('✅ File uploaded successfully!');
});

// 🏠 Upload page
app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));
    const totalMaps = files.length;
    const totalSizeMB = (files.reduce((sum, f) => sum + fs.statSync(path.join(uploadDir, f)).size, 0) / (1024 * 1024)).toFixed(2);

    const logs = fs.existsSync(voiceLogFile)
        ? fs.readFileSync(voiceLogFile, 'utf8').trim().split('\n').filter(Boolean)
        : [];

    const recentLogs = logs.slice(-5).reverse().map(line => `<li>${line}</li>`).join('');

    res.send(`
        <html><head><title>🛠 Server Dashboard</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f9f9f9;">
            <h1>🛠 Unity Upload Server Dashboard</h1>
            <p>📁 Total Maps: <b>${totalMaps}</b></p>
            <p>💾 Disk Usage: <b>${totalSizeMB} MB</b> / 500 MB</p>
            <p>🔇 Voice Ban Entries: <b>${logs.length}</b></p>

            <hr>
            <h3>📂 Quick Links</h3>
            <ul>
                <li><a href="/uploads">📤 View Uploaded Maps</a></li>
                <li><a href="/dashboard/voice-bans">🔇 View Voice Logs</a></li>
            </ul>

            <hr>
            <h3>🕵️ Recent Voice Logs</h3>
            <ul>${recentLogs || '<li>No logs yet.</li>'}</ul>
        </body></html>
    `);
});


// 📤 GET delete
app.get('/delete-file', (req, res) => {
    const file = req.query.filename;
    if (!file) return res.redirect('/');
    try {
        fs.unlinkSync(path.join(uploadDir, file));
        fs.unlinkSync(path.join(uploadDir, file + '.meta'));
    } catch {}
    res.redirect('/');
});

// 🧹 Bulk delete
app.post('/delete-multiple', (req, res) => {
    const files = Array.isArray(req.body.filenames) ? req.body.filenames : [req.body.filenames];
    for (const f of files) {
        try {
            fs.unlinkSync(path.join(uploadDir, f));
            fs.unlinkSync(path.join(uploadDir, f + '.meta'));
        } catch {}
    }
    res.redirect('/');
});

// 🏆 Winner pick
app.post('/pick-winners', (req, res) => {
    const count = parseInt(req.body.count);
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));
    if (!isNaN(count) && count > 0 && count <= files.length) {
        lastWinners = files.sort(() => 0.5 - Math.random()).slice(0, count);
    }
    res.redirect('/');
});

app.post('/clear-winners', (_, res) => {
    lastWinners = [];
    res.redirect('/');
});

// 🧠 Voice ban logs
app.post('/voice-log', (req, res) => {
    const name = req.body.name || 'Unknown';
    const reason = req.body.reason || 'No reason';
    const time = new Date().toISOString();
    const entry = `[${time}] 🔇 ${name}: ${reason}\n`;
    limitLogSize(voiceLogFile);
    fs.appendFileSync(voiceLogFile, entry);
    res.sendStatus(200);
});


// 📊 Dashboard
app.get('/dashboard', (_, res) => {
    res.send(`<html><body style="font-family:sans-serif">
    <h2>🛠 Dashboard</h2>
    <ul>
        <li><a href="/">📁 View Uploads</a></li>
        <li><a href="/dashboard/voice-bans">🔇 Voice Ban Logs</a></li>
    </ul></body></html>`);
});

app.get('/dashboard/voice-bans', (_, res) => {
    const logText = fs.readFileSync(voiceLogFile, 'utf8');
    res.send(`<html><body style="font-family:sans-serif">
    <h2>🔇 Voice Ban Logs</h2><pre>${logText}</pre>
    <a href="/dashboard">⬅️ Back</a></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
