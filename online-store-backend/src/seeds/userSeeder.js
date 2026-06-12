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
    'https://ui-avatars.com/api/?background=random&color=fff&name=Quản trị viên',
    'https://ui-avatars.com/api/?background=random&color=fff&name=Người dùng Demo',
  ];

  const users = await Promise.all([
    UserFactory.create({
      username: 'superadmin',
      email: 'superadmin@laptop.com',
      password: 'superadmin123',
      name: 'Super Admin',
      phone: '0987654321',
      address: '123 Đường Nguyễn Huệ, Hà Nội',
      role: 'super-admin',
      isEmailVerified: true,
      profileImage: profileImages[0]
    }),
    UserFactory.create({
      username: 'admin',
      email: 'admin@laptop.com',
      password: 'admin123',
      name: 'Quản trị viên',
      phone: '0987654322',
      address: '123 Đường Nguyễn Huệ, Hà Nội',
      role: 'admin',
      isEmailVerified: true,
      profileImage: profileImages[1]
    }),
    UserFactory.create({
      username: 'demouser',
      email: 'anyemail@email.com',
      password: '123456',
      name: 'Người dùng Demo',
      phone: '0901234567',
      address: '456 Đường Lê Lợi, TP HCM',
      role: 'user',
      isEmailVerified: false,
      profileImage: profileImages[2]
    }),
  ]);

  const createdUsers = await User.create(users);

  return createdUsers;
};

module.exports = seedUsers;
