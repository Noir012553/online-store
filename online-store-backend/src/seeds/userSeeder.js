/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const User = require('../models/User');
const UserFactory = require('../factories/userFactory');

/**
 * Seed dữ liệu người dùng
 * Tạo 3 user: super-admin, admin, demouser
 */
const seedUsers = async () => {
  await User.deleteMany({});

  const profileImages = [
    'https://ui-avatars.com/api/?background=random&color=fff&name=Super+Admin',
    'https://ui-avatars.com/api/?background=random&color=fff&name=Admin',
    'https://ui-avatars.com/api/?background=random&color=fff&name=Demo+User',
  ];

  const users = await Promise.all([
    UserFactory.create({
      username: 'superadmin',
      email: 'superadmin@laptop.com',
      password: 'superadmin123',
      name: 'Super Admin',
      phone: '0987654321',
      address: null,
      role: 'super-admin',
      isEmailVerified: true,
      profileImage: profileImages[0]
    }),
    UserFactory.create({
      username: 'admin',
      email: 'admin@laptop.com',
      password: 'admin123',
      name: 'Admin User',
      phone: '0987654322',
      address: null,
      role: 'admin',
      isEmailVerified: true,
      profileImage: profileImages[1]
    }),
    UserFactory.create({
      username: 'demouser',
      email: 'anyemail@email.com',
      password: '123456',
      name: 'Demo User',
      phone: '0901234567',
      address: null,
      role: 'user',
      isEmailVerified: false,
      profileImage: profileImages[2]
    }),
  ]);

  const createdUsers = await User.create(users);

  return createdUsers;
};

module.exports = seedUsers;
