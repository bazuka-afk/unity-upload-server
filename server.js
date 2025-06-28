const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const upload = multer();

const uploadDir = path.join(__dirname, 'uploads');
const logsDir = path.join(__dirname, 'logs');
const voiceLogFile = path.join(logsDir, 'voice_bans.log');
const reportsFile = path.join(logsDir, 'reports.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
if (!fs.existsSync(voiceLogFile)) fs.writeFileSync(voiceLogFile, '');
if (!fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, JSON.stringify([]));

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
    const logs = fs.existsSync(voiceLogFile) ? fs.readFileSync(voiceLogFile, 'utf8').trim().split('\n').filter(Boolean) : [];
    const reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
    const currentUtcTime = new Date().toISOString();

    const recentLogs = logs.slice(-5).reverse().map(line => `<li>${line}</li>`).join('');
    const recentReports = reports.slice(-5).map(report => `<li>${report.reporter} reported ${report.reported} for: "${report.reason}" at ${report.time}</li>`).join('');

    res.send(`
        <html><head><title>🛠 Dashboard</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
            <h1>🛠 Unity Upload Server Dashboard</h1>
            <p>📁 Total Maps: <b>${totalMaps}</b></p>
            <p>💾 Disk Usage: <b>${totalSizeMB} MB</b> / 500 MB</p>
            <p>🔇 Voice Ban Entries: <b>${logs.length}</b></p>
            <p>📝 Reports Submitted: <b>${reports.length}</b></p>
            <p>🕒 Current Server UTC Time: <b>${currentUtcTime}</b></p>

            <h3>📂 Quick Links</h3>
            <ul>
                <li><a href="/uploads">📤 Uploaded Maps</a></li>
                <li><a href="/dashboard/voice-bans">🔇 Voice Ban Logs</a></li>
                <li><a href="/dashboard/reports">📝 Reports</a></li>
            </ul>

            <h3>🕵️ Recent Voice Logs</h3>
            <ul>${recentLogs || '<li>No logs yet.</li>'}</ul>

            <h3>🕵️ Recent Reports</h3>
            <ul>${recentReports || '<li>No reports yet.</li>'}</ul>
        </body></html>
    `);
});

app.post('/upload', upload.single('file'), (req, res) => {
    const uploader = req.body.name || 'UnknownUploader';
    const file = req.file;
    if (!file) return res.status(400).send('❌ No file received');

    const filename = file.originalname;
    const filepath = path.join(uploadDir, filename);
    const metaPath = filepath + '.meta';

    fs.writeFileSync(filepath, file.buffer);
    fs.writeFileSync(metaPath, uploader);

    console.log(`📥 File uploaded: ${filename} by ${uploader}`);
    res.status(200).send(`✅ File uploaded: ${filename}`);
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

    let html = `<html><head><title>Uploads</title></head><body style="font-family:sans-serif">
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
    </body></html>`;

    res.send(html);
});

app.post('/voice-log', (req, res) => {
    const name = req.body.name || 'Unknown';
    const reason = req.body.reason || 'No reason';
    const playfabId = req.body.playfabId || 'N/A';
    const time = new Date().toISOString();

    const entry = `[${time}] 🔇 ${name} (${playfabId}): ${reason}\n`;
    try {
        fs.appendFileSync(voiceLogFile, entry);
        console.log(entry.trim());
        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Failed to write to voice log:", err);
        res.sendStatus(500);
    }
});

app.get('/dashboard/voice-bans', (_, res) => {
    const logText = fs.existsSync(voiceLogFile)
        ? fs.readFileSync(voiceLogFile, 'utf8')
        : '[No logs]';
    res.send(`<html><body style="font-family:sans-serif">
    <h2>🔇 Voice Ban Logs</h2><pre>${logText}</pre>
    <a href="/">⬅️ Back to Dashboard</a></body></html>`);
});

app.post('/submit-report', (req, res) => {
    const reporter = req.body.reporter;
    const reported = req.body.reported;
    const reason = req.body.reason;

    if (!reporter || !reported || !reason) {
        return res.status(400).send('❌ Missing required fields');
    }

    const report = {
        reporter,
        reported,
        reason,
        time: new Date().toISOString(),
    };

    const reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
    reports.push(report);
    fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
    res.send('✅ Report submitted successfully.');
});

app.get('/dashboard/reports', (req, res) => {
    const reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
    const reportsList = reports.map(report => `
        <tr>
            <td>${report.reporter}</td>
            <td>${report.reported}</td>
            <td>${report.reason}</td>
            <td>${report.time}</td>
        </tr>
    `).join('');

    res.send(`
        <html><body style="font-family:sans-serif">
        <h2>📝 Reports</h2>
        <table border="1" cellpadding="6">
            <tr>
                <th>Reporter</th>
                <th>Reported</th>
                <th>Reason</th>
                <th>Time</th>
            </tr>
            ${reportsList}
        </table>
        <a href="/">⬅️ Back to Dashboard</a></body></html>
    `);
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

app.get('/api/servertime', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(new Date().toISOString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
