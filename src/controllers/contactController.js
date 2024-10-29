console.log('Environment variables:');
console.log('ELASTIC_EMAIL_USER:', process.env.ELASTIC_EMAIL_USER);
console.log('ELASTIC_EMAIL_PASSWORD:', process.env.ELASTIC_EMAIL_PASSWORD ? 'Set' : 'Not set');
console.log('ADMIN_EMAIL:', process.env.ADMIN_EMAIL);

const ContactMessage = require('../models/ContactMessage');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.elasticemail.com",
  port: 2525,
  secure: false,
  auth: {
    user: "workingdevops274@gmail.com",
    pass: "35E5E519939BFA387E7F929205FB7F04AFBE"
  }
});

transporter.verify(function(error, success) {
  if (error) {
    console.log("Error verifying transporter:", error);
  } else {
    console.log("Server is ready to take our messages");
  }
});

exports.submitContactForm = async (req, res) => {
  console.log('submitContactForm function called');
  try {
    const { name, email, message } = req.body;
    console.log('Received form data:', { name, email, message });
    
    // Save to database
    const newMessage = new ContactMessage({ name, email, message });
    await newMessage.save();

    // Prepare email body
    const bodyMessage = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Full Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong> ${message}</p>
    `;

    // Send email using nodemailer
    const info = await transporter.sendMail({
      from: '"Contact Form" <workingdevops274@gmail.com>',
      to: "workingdevops274@gmail.com",
      subject: "New Contact Form Submission",
      html: bodyMessage
    });

    console.log('Email sent:', info.messageId);

    res.status(201).json({ message: 'Your message has been received and stored successfully. We will contact you soon.' });
  } catch (error) {
    console.error('Error in submitContactForm:', error);
    res.status(500).json({ error: 'An error occurred while processing your message. Please try again later.' });
  }
};
