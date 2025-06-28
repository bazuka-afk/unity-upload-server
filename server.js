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
const reportsFile = path.join(logsDir, 'reports.json');
const winnersFile = path.join(logsDir, 'winners.json');
const bannedPlayersFile = path.join(logsDir, 'banned_players.json'); // New file for banned players

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
if (!fs.existsSync(voiceLogFile)) fs.writeFileSync(voiceLogFile, '');
if (!fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, JSON.stringify([]));
if (!fs.existsSync(winnersFile)) fs.writeFileSync(winnersFile, JSON.stringify([]));
if (!fs.existsSync(bannedPlayersFile)) fs.writeFileSync(bannedPlayersFile, JSON.stringify([])); // Create banned players file

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(uploadDir));

// Function to limit log size
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

// Dashboard route
app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));
    const totalMaps = files.length;
    const totalSizeMB = (files.reduce((sum, f) => sum + fs.statSync(path.join(uploadDir, f)).size, 0) / (1024 * 1024)).toFixed(2);
    const logs = fs.existsSync(voiceLogFile) ? fs.readFileSync(voiceLogFile, 'utf8').trim().split('\n').filter(Boolean) : [];
    const reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
    const winners = JSON.parse(fs.readFileSync(winnersFile, 'utf8'));

    const recentLogs = logs.slice(-5).reverse().map(line => `<li>${line}</li>`).join('');
    const recentReports = reports.slice(-5).map(report => `<li>${report.reporter} reported ${report.reported} for: "${report.reason}" at ${report.time}</li>`).join('');
    const currentUtcTime = new Date().toISOString();

    res.send(`
        <html><head><title>🛠 Dashboard</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
            <h1>🛠 Unity Upload Server Dashboard</h1>
            <p>📁 Total Maps: <b>${totalMaps}</b></p>
            <p>💾 Disk Usage: <b>${totalSizeMB} MB</b> / 500 MB</p>
            <p>🔇 Voice Ban Entries: <b>${logs.length}</b></p>
            <p>📝 Reports Submitted: <b>${reports.length}</b></p>
            <p>🏆 Winners Picked: <b>${winners.length}</b></p>
            <p>🕒 Current Server UTC Time: <b>${currentUtcTime}</b></p>

            <h3>📂 Quick Links</h3>
            <ul>
                <li><a href="/uploads">📤 Uploaded Maps</a></li>
                <li><a href="/dashboard/voice-bans">🔇 Voice Ban Logs</a></li>
                <li><a href="/dashboard/reports">📝 Reports</a></li>
                <li><a href="/dashboard/banned-players">🔇 Banned Players</a></li> <!-- New link -->
            </ul>

            <h3>🕵️ Recent Voice Logs</h3>
            <ul>${recentLogs || '<li>No logs yet.</li>'}</ul>

            <h3>🕵️ Recent Reports</h3>
            <ul>${recentReports || '<li>No reports yet.</li>'}</ul>
        </body></html>
    `);
});

// Banned Players List Route (New)
app.get('/dashboard/banned-players', (req, res) => {
    const bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));

    let bannedListHTML = bannedPlayers.map(player => 
        `<tr>
            <td>${player.name}</td>
            <td>${player.banReason}</td>
            <td>${player.banTimeLeft}</td>
            <td><a href="/revoke-ban?playerName=${encodeURIComponent(player.name)}" class="revoke-btn">Revoke Ban</a></td>
        </tr>`
    ).join('');

    res.send(`
        <html><head><title>🔇 Banned Players</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
            <h1>🔇 Banned Players List</h1>
            <table border="1" cellpadding="6">
                <tr>
                    <th>Player Name</th>
                    <th>Ban Reason</th>
                    <th>Time Left</th>
                    <th>Actions</th>
                </tr>
                ${bannedListHTML || '<tr><td colspan="4">No banned players yet.</td></tr>'}
            </table>
            <br><a href="/">⬅️ Back to Dashboard</a></body></html>
    `);
});

// Revoke Ban Route (New)
app.get('/revoke-ban', (req, res) => {
    const playerName = req.query.playerName;

    if (!playerName) {
        return res.status(400).send('❌ Player name is required.');
    }

    // Load the banned players list
    const bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));

    // Find the player to revoke the ban
    const playerIndex = bannedPlayers.findIndex(player => player.name === playerName);

    if (playerIndex === -1) {
        return res.status(404).send('❌ Player not found in the banned list.');
    }

    // Remove the player from the banned list
    bannedPlayers.splice(playerIndex, 1);

    // Save the updated list back to the file
    fs.writeFileSync(bannedPlayersFile, JSON.stringify(bannedPlayers, null, 2));

    // Respond with success
    res.send(`
        <html><head><title>🔇 Ban Revoked</title></head>
        <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
            <h1>✅ Ban Revoked</h1>
            <p>Player <b>${playerName}</b>'s ban has been revoked.</p>
            <br><a href="/dashboard/banned-players">⬅️ Back to Banned Players List</a>
        </body></html>
    `);
});

// Voice log submission route
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

// Existing routes for reports, winners, uploads, etc...

// Server time endpoint for UTC time sync
app.get('/api/servertime', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(new Date().toISOString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Running at http://localhost:${PORT}`));
