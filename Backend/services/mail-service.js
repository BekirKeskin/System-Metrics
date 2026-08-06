const nodemailer = require("nodemailer");

// gmail için nodemail hazır servis ayarları
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

async function sendAlarmEmail(to, subject, text) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("E-posta gönderildi:", info.messageId);
}

module.exports = sendAlarmEmail;