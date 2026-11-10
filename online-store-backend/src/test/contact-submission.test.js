const chai = require('chai');
const sinon = require('sinon');
const express = require('express');
const request = require('supertest');
const emailService = require('../services/emailService');
const { submit } = require('../controllers/contactController');
let sendContactEmails;
const app = express();
app.use(express.json());
app.post('/contact', submit);

const validContact = {
  name: 'Nguyễn Văn A',
  email: 'customer@example.com',
  phone: '+84 901 234 567',
  subject: 'Order question',
  message: 'I have a question about my order.',
};

describe('Contact form submission', () => {
  beforeEach(() => {
    sendContactEmails = sinon.stub(emailService, 'sendContactEmails').resolves();
  });

  afterEach(() => sendContactEmails.restore());

  it('sends both contact emails and acknowledges the submission', async () => {
    const response = await request(app)
      .post('/contact')
      .send({ ...validContact, name: '  Nguyễn Văn A  ' });

    chai.expect(response.status).to.equal(202);
    chai.expect(response.body).to.deep.equal({ success: true });
    chai.expect(sendContactEmails.calledOnceWith({
      ...validContact,
      name: 'Nguyễn Văn A',
    }, undefined)).to.equal(true);
  });

  it('rejects invalid contact data without sending email', async () => {
    const response = await request(app)
      .post('/contact')
      .send({ ...validContact, email: 'not-an-email' });

    chai.expect(response.status).to.equal(400);
    chai.expect(sendContactEmails.called).to.equal(false);
  });

  it('reports an email delivery failure without acknowledging success', async () => {
    sendContactEmails.rejects(new Error('SMTP unavailable'));

    const response = await request(app)
      .post('/contact')
      .send(validContact);

    chai.expect(response.status).to.equal(503);
    chai.expect(response.body).to.deep.equal({
      success: false,
      code: 'CONTACT_EMAIL_UNAVAILABLE',
    });
  });
});
