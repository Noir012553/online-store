const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  code: {
    type: String,
    enum: ['cod', 'vnpay', 'paypal'],
    required: true,
    unique: true,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 240,
    default: '',
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', paymentMethodSchema);
