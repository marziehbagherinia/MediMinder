const fs = require('fs');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const dotenv = require('dotenv');
const express = require('express');
const FormData = require('form-data');

dotenv.config();

const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + Date.now() + ext);
    }
});

const upload = multer({ storage });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => {
    res.send(`
        <h2>Upload an Audio File for Transcription</h2>
        <form action="/transcribe" method="POST" enctype="multipart/form-data">
            <input type="file" name="file" accept="audio/*" required />
            <button type="submit">Upload</button>
        </form>
    `);
});

app.post('/transcribe', upload.single('file'), async (req, res) => {

    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(req.file.path));
        form.append('model', 'whisper-1');

        const speechToText = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'multipart/form-data',
            }
        });

        // Delete the uploaded file after processing
        fs.unlinkSync(req.file.path);

        const textToText = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant."
                },
                {
                    role: "user",
                    content: speechToText.data.text
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            }
        });

        const textToSpeech = await axios.post(
            'https://api.openai.com/v1/audio/speech',
            {
                model: "tts-1",
                input: textToText.data.choices[0].message.content,
                voice: "alloy"
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer', // Important for binary data like audio
            }
        );

        const filePath = path.join(__dirname, 'output.mp3');
        fs.writeFileSync(filePath, textToSpeech.data);

        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error downloading the file');
            } else {
                fs.unlinkSync(filePath);
            }
        });
    } catch (error) {
        // fs.unlinkSync(req.file.path);
        res.status(500).send(error.response ? error.response.data : error.message);
    }

});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
