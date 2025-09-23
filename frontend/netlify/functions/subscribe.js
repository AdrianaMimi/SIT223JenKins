const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "imaanalauddin@gmail.com", 
    pass: process.env.GOOGLE_APP_PASSWORD, 
  },
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email } = JSON.parse(event.body || "{}");

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Email is required" }),
      };
    }

    const mailOptions = {
      from: '"Dev@Deakin" <me@gmail.com>',
      to: email,
      subject: "🎉 Subscription!",
      text: "Thanks for subscribing! You’ll be the first to hear from us!",
      html: "<strong>Thanks for subscribing!</strong><p>We’re excited to have you onboard</p>",
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Email sent!" }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Email failed to send." }),
    };
  }
};
