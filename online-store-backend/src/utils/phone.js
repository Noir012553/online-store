const normalizePhone = (value) => {
  if (typeof value !== 'string') return value;

  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return compact;

  const digits = compact.replace(/^\+/, '');
  if (digits.startsWith('84') && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }

  return digits;
};

const phoneLookupQuery = (phone) => {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, '');
  const separators = '[\\s().-]*';
  const pattern = (value) => new RegExp(`^${value.split('').join(separators)}$`);
  const localTail = digits.startsWith('0') ? digits.slice(1) : digits;
  const equivalentPattern = new RegExp(`^(?:0|\\+?84)${separators}${localTail.split('').join(separators)}$`);

  return {
    $or: [
      { phone: normalized },
      { phone: pattern(digits) },
      { phone: equivalentPattern },
    ],
  };
};

module.exports = { normalizePhone, phoneLookupQuery };
