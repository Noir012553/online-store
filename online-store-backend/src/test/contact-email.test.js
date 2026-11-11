const chai = require('chai');
const sinon = require('sinon');
const nodemailer = require('nodemailer');
const { sendContactEmails, sendNewsletterConfirmationEmail } = require('../services/emailService');

const emailEnvKeys = ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM', 'EMAIL_SERVICE', 'CONTACT_SUPPORT_EMAIL'];
const originalEnv = Object.fromEntries(emailEnvKeys.map(key => [key, process.env[key]]));
const sandbox = sinon.createSandbox();
let sendMail;

const restoreEmailEnvironment = () => {
  emailEnvKeys.forEach(key => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
};

describe('Contact email delivery', () => {
  beforeEach(() => {
    process.env.EMAIL_USER = 'smtp@example.com';
    process.env.EMAIL_PASSWORD = 'test-password';
    process.env.EMAIL_FROM = 'LaptopStore <smtp@example.com>';
    process.env.CONTACT_SUPPORT_EMAIL = 'support@example.com';
    delete process.env.EMAIL_SERVICE;
    sendMail = sandbox.stub().resolves({ accepted: ['recipient@example.com'] });
    sandbox.stub(nodemailer, 'createTransport').returns({ sendMail });
  });

  afterEach(() => {
    sandbox.restore();
    restoreEmailEnvironment();
  });

  it('sends the store notification to the configured support inbox', async () => {
    await sendContactEmails({
      name: '<Customer>',
      email: 'customer@example.com',
      phone: '+84 901 234 567',
      subject: 'Order question',
      message: '<script>alert(1)</script>',
    }, 'en');

    chai.expect(sendMail.calledOnce).to.equal(true);
    chai.expect(sendMail.firstCall.args[0]).to.include({
      to: 'support@example.com',
      subject: '[Contact] Order question',
    });
    chai.expect(sendMail.firstCall.args[0].replyTo).to.deep.equal({
      name: '<Customer>',
      address: 'customer@example.com',
    });
    chai.expect(sendMail.firstCall.args[0].html).to.include('&lt;script&gt;alert(1)&lt;/script&gt;');
    chai.expect(sendMail.firstCall.args[0].to).not.to.equal('customer@example.com');
  });

  it('renders the newsletter confirmation without missing translation values', async () => {
    await sendNewsletterConfirmationEmail('subscriber@example.com', 'vi');

    const message = sendMail.firstCall.args[0];
    chai.expect(message).to.include({
      to: 'subscriber@example.com',
      subject: 'Cảm ơn bạn đã đăng ký nhận bản tin',
    });
    chai.expect(message.html).to.include('Hủy đăng ký');
    chai.expect(message.html).to.include('font-family: Arial, sans-serif');
    chai.expect(message.html).to.include('background-color: #f8f8f8');
    chai.expect(message.html).not.to.include('<style');
    chai.expect(message.html).not.to.include('undefined');
    chai.expect(message.text).not.to.include('undefined');
  });

  it('defaults the store notification to the contact page email', async () => {
    delete process.env.CONTACT_SUPPORT_EMAIL;

    await sendContactEmails({
      name: 'Customer',
      email: 'customer@example.com',
      phone: '+84 901 234 567',
      subject: 'Question',
      message: 'Please contact me',
    }, 'en');

    chai.expect(sendMail.firstCall.args[0].to).to.equal('noir002534@gmail.com');
  });
});
