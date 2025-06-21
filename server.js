const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const MAX_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Upload folder setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const displayName = req.body.name || "Unknown";
        const safeName = displayName.replace(/[^a-z0-9_-]/gi, '_');
        const filename = `${Date.now()}-${safeName}.json`;
        cb(null, filename);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') cb(null, true);
        else cb(new Error('Only JSON files allowed'));
    }
});

// Homepage
app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir)
        .filter(f => f.endsWith('.json'))
        .map(filename => {
            const filePath = path.join(uploadDir, filename);
            const stats = fs.statSync(filePath);
            const sizeKB = (stats.size / 1024).toFixed(1);
            const [timestamp, ...nameParts] = filename.replace('.json', '').split('-');
            const uploader = nameParts.join('-') || "Unknown";

            return {
                filename,
                uploader,
                url: `/uploads/${filename}`,
                sizeKB,
                sizeBytes: stats.size
            };
        });

    const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const usedPercent = ((totalBytes / MAX_STORAGE_BYTES) * 100).toFixed(1);

    let html = `
        <h2>📁 Uploaded Files</h2>
        <p>💾 Used: <strong>${totalMB} MB / 500 MB</strong> (${usedPercent}%)</p>
        <table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Uploader</th><th>File</th><th>Size</th><th>Actions</th></tr>
    `;

    for (const file of files) {
        html += `
        <tr>
            <td>${file.uploader}</td>
            <td><a href="${file.url}" target="_blank">${file.filename}</a></td>
            <td>${file.sizeKB} KB</td>
            <td>
                <form method="POST" action="/delete" style="display:inline">
                    <input type="hidden" name="filename" value="${file.filename}" />
                    <button type="submit">❌ Delete</button>
                </form>
            </td>
        </tr>
        `;
    }

    html += `</table>
        <p style="margin-top:20px; font-size:14px;">🧹 Delete older files to avoid hitting the 500MB limit on Render’s free plan.</p>
    `;

    res.send(html);
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log(`📥 Uploaded: ${req.file.filename}`);
    res.json({ message: '✅ Upload complete', fileUrl });
});

// Delete file
app.post('/delete', (req, res) => {
    const filename = req.body.filename;
    const filePath = path.join(uploadDir, filename);

    if (!filename || !fs.existsSync(filePath)) {
        return res.status(404).send('❌ File not found.');
    }

    fs.unlinkSync(filePath);
    console.log(`🗑️ Deleted: ${filename}`);
    res.redirect('/');
});

// Error handling
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.message);
    res.status(500).json({ error: err.message });
});

// Start
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
