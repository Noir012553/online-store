const chai = require('chai');
const sinon = require('sinon');
const nodemailer = require('nodemailer');
const { sendContactEmails, sendNewsletterConfirmationEmail } = require('../services/emailService');
const { verifyNewsletterUnsubscribeToken } = require('../utils/newsletterUnsubscribeToken');

const emailEnvKeys = ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM', 'EMAIL_SERVICE', 'CONTACT_SUPPORT_EMAIL', 'JWT_ACCESS_SECRET'];
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
    process.env.JWT_ACCESS_SECRET = 'newsletter-email-test-secret';
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

    chai.expect(sendMail.calledTwice).to.equal(true);
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

    const customerConfirmation = sendMail.secondCall.args[0];
    chai.expect(customerConfirmation).to.include({
      to: 'customer@example.com',
      subject: 'LaptopStore received your message',
    });
    chai.expect(customerConfirmation.text).to.include('Hello <Customer>,');
    chai.expect(customerConfirmation.text).not.to.include('Order question');
    chai.expect(customerConfirmation.text).not.to.include('<script>');
    chai.expect(customerConfirmation.html).to.include('Thank you for contacting LaptopStore');
    chai.expect(customerConfirmation.html).not.to.include('Order question');
    chai.expect(customerConfirmation.html).not.to.include('&lt;script&gt;');
  });

  it('keeps the support notification successful if the customer receipt fails', async () => {
    sendMail.onSecondCall().rejects(new Error('Customer mailbox unavailable'));

    await sendContactEmails({
      name: 'Customer',
      email: 'customer@example.com',
      phone: '+84 901 234 567',
      subject: 'Order question',
      message: 'Please contact me',
    }, 'en');

    chai.expect(sendMail.calledTwice).to.equal(true);
  });

  it('renders the newsletter confirmation without missing translation values', async () => {
    await sendNewsletterConfirmationEmail('subscriber@example.com', 'vi');

    const message = sendMail.firstCall.args[0];
    chai.expect(message).to.include({
      to: 'subscriber@example.com',
      subject: 'Cảm ơn bạn đã đăng ký nhận bản tin',
    });
    chai.expect(message.html).to.include('Hủy đăng ký');
    const unsubscribeHref = message.html.match(/class="email-link" href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    chai.expect(unsubscribeHref).to.be.a('string');
    const unsubscribeUrl = new URL(unsubscribeHref);
    chai.expect(unsubscribeUrl.pathname).to.equal('/api/newsletter/unsubscribe');
    chai.expect(verifyNewsletterUnsubscribeToken(unsubscribeUrl.searchParams.get('token'))).to.equal('subscriber@example.com');
    chai.expect(message.text).to.include(unsubscribeHref);
    chai.expect(message.headers).to.deep.include({
      'List-Unsubscribe': `<${unsubscribeHref}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
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
