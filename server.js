const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(express.static(uploadDir));
app.use(bodyParser.urlencoded({ extended: true }));

// Store winner highlights in memory
let lastWinners = [];

// Multer setup
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
    const uploader = req.body.name || 'Unknown';
    if (!req.file) return res.status(400).send('❌ No file uploaded.');

    const metaPath = path.join(uploadDir, req.file.filename + '.meta');
    fs.writeFileSync(metaPath, uploader);

    console.log(`✅ File uploaded: ${req.file.filename} by ${uploader}`);
    res.status(200).send('✅ File uploaded successfully!');
});

// Home page
app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir)
        .filter(f => f.endsWith('.json'))
        .map(filename => {
            const filePath = path.join(uploadDir, filename);
            const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
            const metaPath = filePath + '.meta';
            const uploader = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : 'Unknown';

            return {
                filename,
                uploader,
                url: '/' + filename,
                sizeKB
            };
        });

    const totalMB = (files.reduce((sum, f) => sum + f.sizeKB, 0) / 1024).toFixed(2);
    const usedPercent = ((totalMB / 500) * 100).toFixed(1);

    let html = `
    <html><head><title>Unity Upload Server</title></head><body style="font-family:sans-serif;padding:20px">
    <h2>📁 Uploaded Files</h2>
    <p>💾 Used: <strong>${totalMB} MB / 500 MB</strong> (${usedPercent}%)</p>

    <form method="POST" action="/delete-multiple">
    <table border="1" cellpadding="6" cellspacing="0">
    <tr>
        <th>Select</th>
        <th>Uploader</th>
        <th>File</th>
        <th>Size</th>
        <th>Actions</th>
    </tr>`;

    for (const file of files) {
        const isWinner = lastWinners.includes(file.filename);
        const rowStyle = isWinner ? 'style="background-color:#fff3b0;font-weight:bold;"' : '';
        const trophy = isWinner ? '🏆 ' : '';

        html += `
        <tr ${rowStyle}>
            <td><input type="checkbox" name="filenames" value="${file.filename}"></td>
            <td>${file.uploader}</td>
            <td>${trophy}<a href="${file.url}" target="_blank">${file.filename}</a></td>
            <td>${file.sizeKB} KB</td>
            <td>
                <a href="${file.url}" download>⬇️ Download</a> |
                <form method="POST" action="/delete" style="display:inline">
                    <input type="hidden" name="filename" value="${file.filename}" />
                    <button type="submit">❌ Delete</button>
                </form>
            </td>
        </tr>`;
    }

    html += `
    </table><br>
    <button type="submit">🧹 Delete Selected</button>
    </form>

    <hr style="margin-top:40px">
    <h3>🎲 Pick Random Winner(s)</h3>
    <form method="POST" action="/pick-winners">
        <label>How many winners?</label>
        <input type="number" name="count" min="1" max="${files.length}" required>
        <button type="submit">Pick</button>
    </form>

    <form method="POST" action="/clear-winners" style="margin-top:10px;">
        <button type="submit">❌ Clear Highlights</button>
    </form>

    <p style="margin-top:30px; font-size:13px;">🧼 Clean up old files to stay under Render's 500MB free limit.</p>
    </body></html>
    `;

    res.send(html);
});

// Delete one file
app.post('/delete', (req, res) => {
    const filename = req.body.filename;
    const filePath = path.join(uploadDir, filename);
    const metaPath = filePath + '.meta';

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    console.log(`🗑️ Deleted: ${filename}`);
    res.redirect('/');
});

// Delete multiple files
app.post('/delete-multiple', (req, res) => {
    const filenames = req.body.filenames;
    const selected = Array.isArray(filenames) ? filenames : [filenames];

    for (const filename of selected) {
        const filePath = path.join(uploadDir, filename);
        const metaPath = filePath + '.meta';

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        console.log(`🗑️ Bulk deleted: ${filename}`);
    }

    res.redirect('/');
});

// Pick winners (store them)
app.post('/pick-winners', (req, res) => {
    const count = parseInt(req.body.count);
    const jsonFiles = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));

    if (isNaN(count) || count < 1 || count > jsonFiles.length) {
        return res.redirect('/');
    }

    lastWinners = jsonFiles.sort(() => 0.5 - Math.random()).slice(0, count);
    console.log(`🏆 Winners picked: ${lastWinners.join(', ')}`);
    res.redirect('/');
});

// Clear winners
app.post('/clear-winners', (req, res) => {
    lastWinners = [];
    console.log('🏳️ Winner highlights cleared');
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
