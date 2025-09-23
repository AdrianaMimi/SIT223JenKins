//Original Version
// const express = require('express');
// const cors = require('cors');
// const sgMail = require('@sendgrid/mail');
// require('dotenv').config();

// const app = express();
// const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             callback(new Error('CORS policy error: Not allowed'));
//         }
//     }
// }));
// app.use(express.json());

// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// const PORT = 3000;

// app.post('/subscribe', async (req, res) => {
//     const { email } = req.body;

//     const msg = {
//         to: email,
//         from: 'imaanalauddin@gmail.com',
//         subject: '🎉 Subscription!',
//         text: 'Thanks for subscribing! You’ll be the first to hear from us!',
//         html: '<strong>Thanks for subscribing!</strong><p>We’re excited to have you onboard</p>',
//     };

//     try {
//         await sgMail.send(msg);
//         res.status(200).send({ message: 'Email sent!' });
//     } catch (err) {
//         console.error(err.response?.body || err);
//         res.status(500).send({ message: 'Email failed to send.' });
//     }
// });

// app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

//nodemailer
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = 3000;

const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS policy error: Not allowed"));
      }
    },
  })
);
app.use(express.json());


const transporter = process.env.DISABLE_EMAIL === '1'
  ? nodemailer.createTransport({ streamTransport: true, newline: 'unix' })
  : nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'imaanalauddin@gmail.com', pass: process.env.GOOGLE_APP_PASSWORD },
  });


app.post("/subscribe", async (req, res) => {
  const { email } = req.body;

  const mailOptions = {
    from: '"Dev@Deakin" <me@gmail.com>',
    to: email,
    subject: "🎉 Subscription!",
    text: "Thanks for subscribing! You’ll be the first to hear from us!",
    html: "<strong>Thanks for subscribing!</strong><p>We’re excited to have you onboard</p>",
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send({ message: "Email sent!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Email failed to send." });
  }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));


