const chai = require('chai');
const express = require('express');
const sinon = require('sinon');
const request = require('supertest');
const Newsletter = require('../models/Newsletter');
const newsletterController = require('../controllers/newsletterController');
const { createNewsletterUnsubscribeToken } = require('../utils/newsletterUnsubscribeToken');

const originalSecret = process.env.JWT_ACCESS_SECRET;
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.get('/unsubscribe', newsletterController.showUnsubscribeConfirmation);
app.post('/unsubscribe', newsletterController.unsubscribe);

describe('Newsletter unsubscribe', () => {
  let updateOne;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'newsletter-unsubscribe-test-secret';
    updateOne = sinon.stub(Newsletter, 'updateOne').resolves({ modifiedCount: 1 });
  });

  afterEach(() => {
    updateOne.restore();
    if (originalSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalSecret;
  });

  it('shows a confirmation page without unsubscribing on GET', async () => {
    const token = createNewsletterUnsubscribeToken('Subscriber@Example.com');
    const response = await request(app).get('/unsubscribe').query({ token });

    chai.expect(response.status).to.equal(200);
    chai.expect(response.text).to.include('Bạn có chắc muốn hủy đăng ký');
    chai.expect(response.text).to.include(`name="token" value="${token}"`);
    chai.expect(updateOne.called).to.equal(false);
  });

  it('unsubscribes only the email in a valid signed token', async () => {
    const token = createNewsletterUnsubscribeToken('Subscriber@Example.com');
    const response = await request(app).post('/unsubscribe').type('form').send({ token });

    chai.expect(response.status).to.equal(200);
    chai.expect(response.text).to.include('Bạn đã hủy đăng ký nhận bản tin thành công');
    chai.expect(updateOne.calledOnceWith(
      { email: 'subscriber@example.com', status: 'active' },
      { $set: { status: 'unsubscribed' } },
    )).to.equal(true);
  });

  it('supports one-click POST requests using the tokenized URL', async () => {
    const token = createNewsletterUnsubscribeToken('subscriber@example.com');
    const response = await request(app)
      .post('/unsubscribe')
      .query({ token })
      .type('form')
      .send({ 'List-Unsubscribe': 'One-Click' });

    chai.expect(response.status).to.equal(200);
    chai.expect(updateOne.calledOnce).to.equal(true);
  });

  it('rejects invalid tokens and legacy email-only requests', async () => {
    const response = await request(app).post('/unsubscribe').send({ email: 'subscriber@example.com' });

    chai.expect(response.status).to.equal(400);
    chai.expect(updateOne.called).to.equal(false);
  });
});
