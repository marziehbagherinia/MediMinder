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

        const outputFilePath = path.join(__dirname, 'speech2.mp3');

        axios({
            method: 'post',
            url: 'https://api.openai.com/v1/audio/speech',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            data: {
                model: "tts-1",
                input: textToText.data.choices[0].message.content,
                voice: "alloy"
            },
            responseType: 'stream'
        })
            .then(response => {
                // Pipe the response to a file
                response.data.pipe(fs.createWriteStream(outputFilePath));

                response.data.on('end', () => {
                    console.log('Voice output saved to', outputFilePath);
                    res.sendFile(outputFilePath, (err) => {
                        if (err) {
                            res.status(500).send('Error sending the file.');
                        }
                    });
                });

            })
            .catch(error => {
                console.error('Error:', error.response ? error.response.data : error.message);
            });

        // const mp3 = await axios.post('https://api.openai.com/v1/audio/speech', {
        //     model: "tts-1",
        //     input: "The quick brown fox jumped over the lazy dog",
        //     voice: "alloy"
        // }, {
        //     headers: {
        //         'Authorization': `Bearer ${OPENAI_API_KEY}`,
        //         'Content-Type': 'application/json',
        //     }
        // });

        // res.send(`
        //     <h2>Transcription Result</h2>
        //     <p>${response.data.text}</p>
        //     <p>${response2.data.choices[0].message.content}</p>
        //     <a href="/">Transcribe another file</a>
        // `);
    } catch (error) {
        // fs.unlinkSync(req.file.path);

        console.error('Error transcribing audio:', error);
        res.status(500).send(error.response ? error.response.data : error.message);
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
