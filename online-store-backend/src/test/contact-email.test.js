const chai = require('chai');
const sinon = require('sinon');
const nodemailer = require('nodemailer');
const { sendContactEmails } = require('../services/emailService');

const emailEnvKeys = ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM', 'EMAIL_SERVICE'];
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
    process.env.EMAIL_USER = 'support@example.com';
    process.env.EMAIL_PASSWORD = 'test-password';
    process.env.EMAIL_FROM = 'LaptopStore <support@example.com>';
    delete process.env.EMAIL_SERVICE;
    sendMail = sandbox.stub().resolves({ accepted: ['recipient@example.com'] });
    sandbox.stub(nodemailer, 'createTransport').returns({ sendMail });
  });

  afterEach(() => {
    sandbox.restore();
    restoreEmailEnvironment();
  });

  it('sends the store notification and a localized customer confirmation', async () => {
    await sendContactEmails({
      name: '<Customer>',
      email: 'customer@example.com',
      phone: '+84 901 234 567',
      subject: 'Order question',
      message: '<script>alert(1)</script>',
    }, 'en');

    chai.expect(sendMail.callCount).to.equal(2);
    chai.expect(sendMail.firstCall.args[0]).to.include({
      to: 'support@example.com',
      subject: '[Contact] Order question',
    });
    chai.expect(sendMail.firstCall.args[0].replyTo).to.deep.equal({
      name: '<Customer>',
      address: 'customer@example.com',
    });
    chai.expect(sendMail.firstCall.args[0].html).to.include('&lt;script&gt;alert(1)&lt;/script&gt;');
    chai.expect(sendMail.secondCall.args[0]).to.include({
      to: 'customer@example.com',
      subject: 'LaptopStore received your message',
    });
    chai.expect(sendMail.secondCall.args[0].text).to.include('get back to you as soon as possible');
  });
});
