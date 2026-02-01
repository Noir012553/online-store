/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const User = require('../models/User');
const UserFactory = require('../factories/userFactory');

/**
 * Seed dữ liệu người dùng
 * Tạo 2 user: admin (admin@laptop.com / admin123), demouser (anyemail@email.com / 123456)
 */
const seedUsers = async () => {
  await User.deleteMany({});

  const profileImages = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user1',
  ];

  const users = await Promise.all([
    UserFactory.create({
      username: 'admin',
      email: 'admin@laptop.com',
      password: 'admin123',
      role: 'admin',
      profileImage: profileImages[0]
    }),
    UserFactory.create({
      username: 'demouser',
      email: 'anyemail@email.com',
      password: '123456',
      role: 'user',
      profileImage: profileImages[1]
    }),
  ]);

  const createdUsers = await User.create(users);

  return createdUsers;
};

module.exports = seedUsers;
