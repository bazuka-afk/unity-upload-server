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
const bannedPlayersFile = path.join(logsDir, 'banned_players.json'); // Declare bannedPlayersFile once




if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
if (!fs.existsSync(voiceLogFile)) fs.writeFileSync(voiceLogFile, '');
if (!fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, JSON.stringify([]));
if (!fs.existsSync(winnersFile)) fs.writeFileSync(winnersFile, JSON.stringify([]));
if (!fs.existsSync(bannedPlayersFile)) fs.writeFileSync(bannedPlayersFile, JSON.stringify([])); // Ensure banned_players.json is created




app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(uploadDir));
app.use(bodyParser.json());

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

function cleanExpiredBans() {
    if (!fs.existsSync(bannedPlayersFile)) return;

    let bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));
    const now = new Date();

    const activeBans = bannedPlayers.filter(player => {
        const banExpiry = new Date(player.BanTimeLeft);
        return banExpiry > now;
    });

    if (activeBans.length !== bannedPlayers.length) {
        fs.writeFileSync(bannedPlayersFile, JSON.stringify(activeBans, null, 2));
        console.log(`Cleaned expired bans. Active bans count: ${activeBans.length}`);
    }
}


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
                 <li><a href="/dashboard/banned-players">🔇 Banned Players</a></li> <!-- Added link -->
            </ul>

            <h3>🕵️ Recent Voice Logs</h3>
            <ul>${recentLogs || '<li>No logs yet.</li>'}</ul>

            <h3>🕵️ Recent Reports</h3>
            <ul>${recentReports || '<li>No reports yet.</li>'}</ul>
        </body></html>
    `);
});


app.get('/api/check-ban/:playfabId', (req, res) => {
  const playfabId = req.params.playfabId;
  const bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));
  const bannedPlayer = bannedPlayers.find(p => p.PlayFabId === playfabId);

  if (bannedPlayer) {
    res.json({
      isBanned: true,
      banReason: bannedPlayer.BanReason,
      banExpiryUtc: bannedPlayer.BanTimeLeft
    });
  } else {
    res.json({ isBanned: false });
  }
});


// POST route to add player to banned list (Ban a player)
app.post('/api/ban-player', (req, res) => {
    const { playfabId, reason, banDuration } = req.body;

    if (!playfabId || !reason || !banDuration) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    let bannedPlayers = [];
    if (fs.existsSync(bannedPlayersFile)) {
        bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));
    }

    if (bannedPlayers.find(player => player.PlayFabId === playfabId)) {
        return res.status(400).json({ error: 'Player is already banned.' });
    }

    // Use UTC now + duration in minutes for ban expiration
    const banExpiresAt = new Date(Date.now() + banDuration * 60 * 1000);

    bannedPlayers.push({
        PlayFabId: playfabId,
        BanReason: reason,
        BanTimeLeft: banExpiresAt.toISOString() // store UTC time as ISO string
    });

    fs.writeFileSync(bannedPlayersFile, JSON.stringify(bannedPlayers, null, 2));

    res.status(200).json({
        message: `Player ${playfabId} has been banned for ${banDuration} minutes (UTC).`,
        banExpiresAt: banExpiresAt.toISOString()
    });
});

;

// Revoke Ban Route
// **POST /api/revoke-ban** — Revoke Ban
// Revoke Ban Route
app.get('/revoke-ban', (req, res) => {
  const playerId = req.query.playerName; // Actually PlayFabId here

  if (!playerId) {
    return res.status(400).send('Missing playerName parameter.');
  }

  let bannedPlayers = [];
  if (fs.existsSync(bannedPlayersFile)) {
    bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));
  }

  const index = bannedPlayers.findIndex(p => p.PlayFabId === playerId);

  if (index === -1) {
    return res.status(404).send('Player not found in banned list.');
  }

  bannedPlayers.splice(index, 1);
  fs.writeFileSync(bannedPlayersFile, JSON.stringify(bannedPlayers, null, 2));

  res.redirect('/dashboard/banned-players');
});

// Banned Players List Route
app.get('/dashboard/banned-players', (req, res) => {
  const bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));

  let bannedListHTML = bannedPlayers.map(player => 
    `<tr>
        <td>${player.PlayFabId}</td>
        <td>${player.BanReason}</td>
        <td>${player.BanTimeLeft}</td>
        <td><a href="/revoke-ban?playerName=${encodeURIComponent(player.PlayFabId)}" class="revoke-btn">Revoke Ban</a></td>
    </tr>`).join('');

  res.send(`
      <html><head><title>🔇 Banned Players</title></head>
      <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
          <h1>🔇 Banned Players List</h1>
          <table border="1" cellpadding="6">
              <tr>
                  <th>Player ID</th>
                  <th>Ban Reason</th>
                  <th>Time Left</th>
                  <th>Actions</th>
              </tr>
              ${bannedListHTML || '<tr><td colspan="4">No banned players yet.</td></tr>'}
          </table>
          <br><a href="/">⬅️ Back to Dashboard</a></body></html>
  `);
});

app.get('/api/servertime', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(new Date().toISOString());
});

// Banned Players List Route
app.get('/dashboard/banned-players', (req, res) => {
    const bannedPlayers = JSON.parse(fs.readFileSync(bannedPlayersFile, 'utf8'));

    let bannedListHTML = bannedPlayers.map(player => 
        `<tr>
            <td>${player.name}</td>
            <td>${player.banReason}</td>
            <td>${player.banTimeLeft}</td>
            <td><a href="/revoke-ban?playerName=${encodeURIComponent(player.name)}" class="revoke-btn">Revoke Ban</a></td>
        </tr>`).join('');

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
// Pick winners - POST route
app.post('/pick-winners', (req, res) => {
    const count = parseInt(req.body.count);
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));

    if (isNaN(count) || count < 1 || count > files.length) {
        return res.status(400).send("Invalid count.");
    }

    const shuffled = [...files].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    fs.writeFileSync(winnersFile, JSON.stringify(selected, null, 2));
    res.redirect('/uploads');
});

// Clear winners - POST route
app.post('/clear-winners', (req, res) => {
    fs.writeFileSync(winnersFile, JSON.stringify([]));
    res.redirect('/uploads');
});

// Your existing routes below...

// Reports page
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

// Upload page
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

// Add report submission route
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

// Delete file
app.get('/delete-file', (req, res) => {
    const file = req.query.filename;
    if (!file) return res.redirect('/');
    try {
        fs.unlinkSync(path.join(uploadDir, file));
        fs.unlinkSync(path.join(uploadDir, file + '.meta'));
    } catch {}
    res.redirect('/uploads');
});

// Bulk delete
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

// GET route to serve raw voice ban log text at /voice-log
app.get('/voice-log', (req, res) => {
  if (!fs.existsSync(voiceLogFile)) {
    return res.status(404).send('No voice ban logs found.');
  }
  const logText = fs.readFileSync(voiceLogFile, 'utf8');
  res.setHeader('Content-Type', 'text/plain');
  res.send(logText);
});


// View voice ban logs
app.get('/dashboard/voice-bans', (_, res) => {
    const logText = fs.existsSync(voiceLogFile) ? fs.readFileSync(voiceLogFile, 'utf8') : '[No logs]';
    res.send(`<html><body style="font-family:sans-serif">
    <h2>🔇 Voice Ban Logs</h2><pre>${logText}</pre>
    <a href="/">⬅️ Back to Dashboard</a></body></html>`);
});

// Server time endpoint for UTC time sync
app.get('/api/servertime', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(new Date().toISOString());
});

const PORT = process.env.PORT || 3000;
// Clean expired bans on server start
cleanExpiredBans();
// Schedule to clean expired bans every 60 seconds
setInterval(cleanExpiredBans, 10 * 1000);

app.listen(PORT, () => console.log(`🚀 Running at http://localhost:${PORT}`));
