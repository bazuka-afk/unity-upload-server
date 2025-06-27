// server.js (FULL VERSION WITH UNBAN FEATURE)
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();

const uploadDir = path.join(__dirname, 'uploads');
const logsDir = path.join(__dirname, 'logs');
const voiceLogFile = path.join(logsDir, 'voice_bans.log');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
if (!fs.existsSync(voiceLogFile)) fs.writeFileSync(voiceLogFile, '');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(uploadDir));

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

app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));
    const totalMaps = files.length;
    const totalSizeMB = (files.reduce((sum, f) => sum + fs.statSync(path.join(uploadDir, f)).size, 0) / (1024 * 1024)).toFixed(2);
    const logs = fs.existsSync(voiceLogFile)
        ? fs.readFileSync(voiceLogFile, 'utf8').trim().split('\n').filter(Boolean)
        : [];
    const recentLogs = logs.slice(-5).reverse().map(line => `<li>${line}</li>`).join('');
    res.send(`
        <html><head><title>🛠 Dashboard</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
            <h1>🛠 Unity Upload Server Dashboard</h1>
            <p>📁 Total Maps: <b>${totalMaps}</b></p>
            <p>💾 Disk Usage: <b>${totalSizeMB} MB</b> / 500 MB</p>
            <p>🔇 Voice Ban Entries: <b>${logs.length}</b></p>
            <h3>📂 Quick Links</h3>
            <ul>
                <li><a href="/uploads">📤 Uploaded Maps</a></li>
                <li><a href="/dashboard/voice-bans">🔇 Voice Ban Logs</a></li>
            </ul>
            <h3>🕵️ Recent Voice Logs</h3>
            <ul>${recentLogs || '<li>No logs yet.</li>'}</ul>
        </body></html>
    `);
});

app.get('/uploads', (req, res) => {
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json')).map(filename => {
        const filePath = path.join(uploadDir, filename);
        const metaPath = filePath + '.meta';
        const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
        const uploader = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : 'Unknown';
        return { filename, uploader, sizeKB, url: '/' + filename };
    });

    const totalMB = (files.reduce((a, b) => a + b.sizeKB, 0) / 1024).toFixed(2);
    const usedPercent = ((totalMB / 500) * 100).toFixed(1);

    let html = `
    <html><head><title>Uploads</title></head><body style="font-family:sans-serif">
    <h2>📤 Uploads</h2>
    <p>Used: ${totalMB} MB / 500 MB (${usedPercent}%)</p>
    <a href="/">⬅️ Back to Dashboard</a><br><br>
    <form method="POST" action="/delete-multiple">
    <table border="1" cellpadding="6"><tr><th></th><th>Uploader</th><th>File</th><th>Size</th><th>Actions</th></tr>`;

    for (const file of files) {
        html += `<tr>
        <td><input type="checkbox" name="filenames" value="${file.filename}"></td>
        <td>${file.uploader}</td>
        <td><a href="${file.url}" target="_blank">${file.filename}</a></td>
        <td>${file.sizeKB} KB</td>
        <td><a href="/delete-file?filename=${file.filename}">❌ Delete</a></td>
        </tr>`;
    }

    html += `</table><button type="submit">🧹 Delete Selected</button></form>
    <br><form method="POST" action="/pick-winners">
        <label>Pick Winners:</label>
        <input name="count" type="number" min="1" max="${files.length}" required>
        <button type="submit">🎲 Pick</button>
    </form>
    <form method="POST" action="/clear-winners"><button>Reset Winners</button></form>
    </body></html>`;
    res.send(html);
});

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

app.get('/delete-file', (req, res) => {
    const file = req.query.filename;
    if (!file) return res.redirect('/');
    try {
        fs.unlinkSync(path.join(uploadDir, file));
        fs.unlinkSync(path.join(uploadDir, file + '.meta'));
    } catch {}
    res.redirect('/uploads');
});

app.post('/delete-multiple', (req, res) => {
    const files = Array.isArray(req.body.filenames) ? req.body.filenames : [req.body.filenames];
    for (const f of files) {
        try {
            fs.unlinkSync(path.join(uploadDir, f));
            fs.unlinkSync(path.join(uploadDir, f + '.meta'));
        } catch {}
    }
    res.redirect('/uploads');
});

app.post('/voice-log', async (req, res) => {
    const name = req.body.name || 'Unknown';
    const reason = req.body.reason || 'No reason';
    const playfabId = req.body.playfabId;
    const time = new Date().toISOString();
    const entry = `[${time}] 🔇 ${name} (${playfabId || 'N/A'}): ${reason}\n`;
    limitLogSize(voiceLogFile);
    fs.appendFileSync(voiceLogFile, entry);
    console.log(entry.trim());
    res.sendStatus(200);
});

app.get('/dashboard/voice-bans', (_, res) => {
    const logText = fs.existsSync(voiceLogFile)
        ? fs.readFileSync(voiceLogFile, 'utf8')
        : '[No logs]';
    res.send(`<html><body style="font-family:sans-serif">
    <h2>🔇 Voice Ban Logs</h2><pre>${logText}</pre>
    <form method="POST" action="/unban-user">
      <label>PlayFab ID:</label>
      <input type="text" name="playfabId" required />
      <button type="submit">🔓 Unban</button>
    </form>
    <a href="/">⬅️ Back to Dashboard</a></body></html>`);
});

app.post('/unban-user', async (req, res) => {
    const playfabId = req.body.playfabId;
    if (!playfabId) return res.status(400).send('❌ Missing PlayFabId');
    try {
        await axios.post(`https://${process.env.PLAYFAB_TITLE_ID}.playfabapi.com/Admin/UnbanUsers`, {
            PlayFabIds: [playfabId]
        }, {
            headers: {
                'X-SecretKey': process.env.PLAYFAB_SECRET_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ Unbanned ${playfabId}`);
        res.send('✅ Unban successful.');
    } catch (err) {
        console.error('❌ PlayFab unban failed:', err.response?.data || err.message);
        res.status(500).send('❌ Failed to unban.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Running at http://localhost:${PORT}`));
app.listen(PORT, () => console.log(`🚀 and hello there`));
