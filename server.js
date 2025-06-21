const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS so Unity can connect from localhost or WebGL builds
app.use(cors());

// Serve static files from uploads folder (to access uploaded files)
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

// Set limits and file type filters (optional)
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed!'));
        }
    }
});

// GET / - Friendly homepage
app.get('/', (req, res) => {
    res.send(`
        <h2>📁 Unity JSON Upload Server</h2>
        <p>Use <code>POST /upload</code> to upload .json files.</p>
    `);
});

// POST /upload - File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({
        message: '✅ File uploaded successfully!',
        fileUrl: fileUrl
    });
});

// Error handler (for Multer or other middleware errors)
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
