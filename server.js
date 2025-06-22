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

// Multer config
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// 🟩 Upload route
app.post('/upload', upload.single('file'), (req, res) => {
    const uploader = req.body.name || 'Unknown';
    if (!req.file) {
        return res.status(400).send('❌ No file uploaded.');
    }

    const metaPath = path.join(uploadDir, req.file.filename + '.meta');
    fs.writeFileSync(metaPath, uploader);

    console.log(`✅ File uploaded: ${req.file.filename} by ${uploader}`);
    res.status(200).send('✅ File uploaded successfully!');
});

// 🟦 Home page with files
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
        html += `
        <tr>
            <td><input type="checkbox" name="filenames" value="${file.filename}"></td>
            <td>${file.uploader}</td>
            <td><a href="${file.url}" target="_blank">${file.filename}</a></td>
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
    </table>
    <br>
    <button type="submit">🧹 Delete Selected</button>
    </form>

    <hr style="margin-top:40px">
    <h3>🎲 Random Winner Picker</h3>
    <form method="POST" action="/pick-winners">
        <label>How many winners?</label>
        <input type="number" name="count" min="1" max="${files.length}" required>
        <button type="submit">Pick Winner(s)</button>
    </form>

    <p style="margin-top:20px; font-size:14px;">🧼 Clean up old files to stay within 500MB limit.</p>
    `;

    res.send(html);
});

// 🟥 Single delete
app.post('/delete', (req, res) => {
    const filename = req.body.filename;
    const filePath = path.join(uploadDir, filename);
    const metaPath = filePath + '.meta';

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    console.log(`🗑️ Deleted file: ${filename}`);
    res.redirect('/');
});

// 🟧 Bulk delete
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

// 🟨 Winner picker
app.post('/pick-winners', (req, res) => {
    const count = parseInt(req.body.count);
    const jsonFiles = fs.readdirSync(uploadDir).filter(f => f.endsWith('.json'));

    if (isNaN(count) || count < 1 || count > jsonFiles.length) {
        return res.send(`<p>❌ Invalid count. <a href="/">Back</a></p>`);
    }

    const winners = jsonFiles.sort(() => 0.5 - Math.random()).slice(0, count);

    let html = `<h2>🏆 Winners (${count})</h2><ul>`;
    for (const file of winners) {
        html += `<li><strong>${file}</strong></li>`;
    }
    html += `</ul><p><a href="/">⬅️ Back</a></p>`;

    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
