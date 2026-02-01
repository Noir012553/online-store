/**
 * Email Service - Gửi email xác minh, reset password, etc.
 * Sử dụng Nodemailer hoặc service khác
 */

const nodemailer = require('nodemailer');

/**
 * Email transporter configuration
 * Hỗ trợ nhiều providers: Gmail, SendGrid, AWS SES, etc.
 */
const createTransporter = () => {
  // Check if email credentials are provided
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('⚠️  Email credentials not configured. Email functionality disabled.');
    console.warn('📧 To enable email, set EMAIL_USER and EMAIL_PASSWORD in .env');
    return null;
  }

  // ============= OPTION 1: Gmail (Recommended for testing) =============
  // Bước 1: Enable 2-Step Verification trên Gmail account
  // Bước 2: Tạo App Password: https://myaccount.google.com/apppasswords
  // Bước 3: Set .env variables:
  // EMAIL_HOST=smtp.gmail.com
  // EMAIL_PORT=587
  // EMAIL_USER=your-email@gmail.com
  // EMAIL_PASSWORD=your-app-password

  // ============= OPTION 2: SendGrid =============
  // 1. Đăng ký tài khoản: https://sendgrid.com
  // 2. Tạo API key
  // 3. Set .env:
  // SENDGRID_API_KEY=your-api-key
  // EMAIL_FROM=noreply@example.com

  // ============= OPTION 3: AWS SES =============
  // 1. Verify sender email trong SES
  // 2. Set .env:
  // AWS_ACCESS_KEY_ID=...
  // AWS_SECRET_ACCESS_KEY=...
  // AWS_REGION=us-east-1

  // For now, using SMTP configuration (Gmail/custom SMTP)
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    // SendGrid configuration (requires nodemailer-sendgrid plugin)
    // npm install nodemailer-sendgrid-transport
    const sgTransport = require('nodemailer-sendgrid-transport');
    return nodemailer.createTransport(
      sgTransport({
        auth: {
          api_key: process.env.SENDGRID_API_KEY,
        },
      })
    );
  }

  // Default: SMTP (Gmail, custom SMTP, etc.)
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Gửi email xác minh đến người dùng mới
 * @param {String} email - Email người nhận
 * @param {String} verificationUrl - URL xác minh với token
 * @returns {Promise} Email sent result
 */
const sendVerificationEmail = async (email, verificationUrl) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the link
    if (!transporter) {
      console.log('📧 Email disabled. Verification link (for testing):');
      console.log(`   ${verificationUrl}`);
      return { message: 'Email disabled (dev mode)' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Xác minh email tài khoản của bạn - LaptopStore',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Xác Minh Email</h2>
          <p style="color: #666; font-size: 16px;">
            Cảm ơn bạn đã đăng ký tài khoản trên LaptopStore!
          </p>
          <p style="color: #666; font-size: 16px;">
            Vui lòng nhấp vào nút dưới đây để xác minh email của bạn:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="display: inline-block; padding: 12px 30px; background-color: #ef4444; 
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Xác Minh Email
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            Hoặc copy link này vào trình duyệt:<br/>
            <a href="${verificationUrl}" style="color: #ef4444;">${verificationUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            Link này sẽ hết hạn sau 30 phút.<br/>
            Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2024 LaptopStore. All rights reserved.
          </p>
        </div>
      `,
      text: `
        Xác Minh Email
        
        Cảm ơn bạn đã đăng ký tài khoản trên LaptopStore!
        
        Vui lòng truy cập link sau để xác minh email:
        ${verificationUrl}
        
        Link này sẽ hết hạn sau 30 phút.
        Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.
        
        © 2024 LaptopStore
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

/**
 * Gửi email reset password
 * @param {String} email - Email người nhận
 * @param {String} resetUrl - URL reset password với token
 * @returns {Promise} Email sent result
 */
const sendResetPasswordEmail = async (email, resetUrl) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the link
    if (!transporter) {
      console.log('📧 Email disabled. Password reset link (for testing):');
      console.log(`   ${resetUrl}`);
      return { message: 'Email disabled (dev mode)' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Đặt lại mật khẩu - LaptopStore',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Đặt Lại Mật Khẩu</h2>
          <p style="color: #666; font-size: 16px;">
            Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.
          </p>
          <p style="color: #666; font-size: 16px;">
            Nhấp vào nút dưới đây để tạo mật khẩu mới:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; padding: 12px 30px; background-color: #ef4444; 
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Đặt Lại Mật Khẩu
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            Hoặc copy link này vào trình duyệt:<br/>
            <a href="${resetUrl}" style="color: #ef4444;">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            Link này sẽ hết hạn sau 30 phút.<br/>
            Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2024 LaptopStore. All rights reserved.
          </p>
        </div>
      `,
      text: `
        Đặt Lại Mật Khẩu
        
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.
        
        Vui lòng truy cập link sau để tạo mật khẩu mới:
        ${resetUrl}
        
        Link này sẽ hết hạn sau 30 phút.
        Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        
        © 2024 LaptopStore
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Reset password email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Error sending reset password email:', error);
    throw new Error(`Failed to send reset password email: ${error.message}`);
  }
};

/**
 * Gửi email chứa OTP (để tương lai nếu implement 2FA)
 * @param {String} email - Email người nhận
 * @param {String} otp - One-time password
 * @returns {Promise} Email sent result
 */
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = createTransporter();

    // If email is not configured, skip sending but log the OTP
    if (!transporter) {
      console.log('📧 Email disabled. OTP (for testing):');
      console.log(`   ${otp}`);
      return { message: 'Email disabled (dev mode)' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Mã OTP của bạn - LaptopStore',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Mã Xác Minh</h2>
          <p style="color: #666; font-size: 16px;">
            Đây là mã OTP để xác minh danh tính của bạn.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #ef4444; letter-spacing: 5px;">
              ${otp}
            </div>
          </div>
          <p style="color: #999; font-size: 14px;">
            Mã này sẽ hết hạn sau 10 phút.<br/>
            Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2024 LaptopStore. All rights reserved.
          </p>
        </div>
      `,
      text: `
        Mã Xác Minh
        
        Mã OTP của bạn: ${otp}
        
        Mã này sẽ hết hạn sau 10 phút.
        Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.
        
        © 2024 LaptopStore
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendOTPEmail,
};
