const chai = require('chai');
const express = require('express');
const request = require('supertest');
const sinon = require('sinon');
const Newsletter = require('../models/Newsletter');
const emailService = require('../services/emailService');
const newsletterController = require('../controllers/newsletterController');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.lang = 'vi';
  next();
});
app.post('/newsletter', newsletterController.subscribe);

describe('Newsletter subscription email', () => {
  let findOne;
  let findOneAndUpdate;
  let sendNewsletterConfirmationEmail;

  beforeEach(() => {
    findOne = sinon.stub(Newsletter, 'findOne');
    findOneAndUpdate = sinon.stub(Newsletter, 'findOneAndUpdate');
    sendNewsletterConfirmationEmail = sinon.stub(emailService, 'sendNewsletterConfirmationEmail').resolves({ accepted: ['subscriber@example.com'] });
  });

  afterEach(() => {
    findOne.restore();
    findOneAndUpdate.restore();
    sendNewsletterConfirmationEmail.restore();
  });

  it('resends confirmation when the email is already active', async () => {
    const subscriber = {
      _id: 'subscriber-id',
      email: 'subscriber@example.com',
      phone: '0901234567',
      status: 'active',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    findOne.resolves(subscriber);

    const response = await request(app)
      .post('/newsletter')
      .send({ email: subscriber.email, phone: subscriber.phone });

    chai.expect(response.status).to.equal(200);
    chai.expect(response.body.success).to.equal(true);
    chai.expect(sendNewsletterConfirmationEmail.calledOnceWith(subscriber.email, 'vi')).to.equal(true);
    chai.expect(findOneAndUpdate.called).to.equal(false);
  });

  it('sends confirmation after creating a new subscription', async () => {
    const subscriber = {
      _id: 'subscriber-id',
      email: 'subscriber@example.com',
      phone: '0901234567',
      status: 'active',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    findOne.resolves(null);
    findOneAndUpdate.resolves(subscriber);

    const response = await request(app)
      .post('/newsletter')
      .send({ email: subscriber.email, phone: subscriber.phone });

    chai.expect(response.status).to.equal(201);
    chai.expect(response.body.success).to.equal(true);
    chai.expect(sendNewsletterConfirmationEmail.calledOnceWith(subscriber.email, 'vi')).to.equal(true);
  });

  it('returns a delivery error instead of claiming email was sent', async () => {
    const subscriber = {
      _id: 'subscriber-id',
      email: 'subscriber@example.com',
      phone: '0901234567',
      status: 'active',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    findOne.resolves(subscriber);
    sendNewsletterConfirmationEmail.rejects(new Error('SMTP unavailable'));

    const response = await request(app)
      .post('/newsletter')
      .send({ email: subscriber.email, phone: subscriber.phone });

    chai.expect(response.status).to.equal(503);
    chai.expect(response.body.success).to.equal(false);
    chai.expect(response.body.message).to.equal('Không gửi được email xác nhận. Vui lòng thử lại sau.');
  });
});
