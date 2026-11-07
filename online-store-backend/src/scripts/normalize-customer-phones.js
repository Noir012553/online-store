const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const { connectMongo } = require('../config/mongoConnection');
const { normalizePhone } = require('../utils/phone');

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm=normalize-customer-phones');

const main = async () => {
  if (apply && !confirmed) {
    throw new Error('Applying changes requires --confirm=normalize-customer-phones');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  await connectMongo();
  try {
    const customers = await Customer.find({}).select('_id phone isDeleted').lean();
    const activeByPhone = new Map();

    for (const customer of customers) {
      if (customer.isDeleted) continue;
      const normalized = normalizePhone(customer.phone);
      if (!normalized) continue;
      const matches = activeByPhone.get(normalized) || [];
      matches.push(customer);
      activeByPhone.set(normalized, matches);
    }

    const ambiguousPhones = new Set(
      [...activeByPhone.entries()]
        .filter(([, matches]) => matches.length > 1)
        .map(([phone]) => phone),
    );
    const operations = customers.flatMap((customer) => {
      const normalized = normalizePhone(customer.phone);
      if (!normalized || normalized === customer.phone) return [];
      if (!customer.isDeleted && ambiguousPhones.has(normalized)) return [];
      return [{
        updateOne: {
          filter: { _id: customer._id, phone: customer.phone },
          update: { $set: { phone: normalized } },
        },
      }];
    });
    const collisions = [...activeByPhone.entries()]
      .filter(([, matches]) => matches.length > 1)
      .map(([phone, matches]) => ({
        phone: `***${phone.slice(-4)}`,
        customerIds: matches.map(({ _id }) => String(_id)),
      }));

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      inspected: customers.length,
      plannedUpdates: operations.length,
      skippedAmbiguousCustomers: customers.filter((customer) => {
        const normalized = normalizePhone(customer.phone);
        return !customer.isDeleted && ambiguousPhones.has(normalized);
      }).length,
      collisions,
    }, null, 2));

    if (apply && operations.length) {
      const result = await Customer.bulkWrite(operations, { ordered: false });
      console.log(JSON.stringify({
        modified: result.modifiedCount,
        skippedBecauseChangedDuringMigration: operations.length - result.modifiedCount,
      }, null, 2));
    }
  } finally {
    await mongoose.connection.close();
  }
};

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
