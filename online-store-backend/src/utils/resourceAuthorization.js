const isAdmin = (user) => ['admin', 'super-admin'].includes(user?.role);

const isCustomerOwner = (customer, user) => Boolean(
  user?.isEmailVerified &&
  customer?.email &&
  user?.email &&
  customer.email.toLowerCase() === user.email.toLowerCase()
);

const isOrderOwner = (order, user) => {
  if (!order || !user) return false;

  const orderUserId = order.user?._id || order.user;
  return String(orderUserId || '') === String(user._id)
    || isCustomerOwner(order.customer, user);
};

module.exports = { isAdmin, isCustomerOwner, isOrderOwner };
