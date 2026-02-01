/**
 * Factory để tạo dữ liệu người dùng động cho testing/seeding
 * Hỗ trợ tạo một hoặc nhiều user cùng lúc
 *
 * LƯU Ý: Không hash password ở đây! User.pre('save') sẽ tự động hash
 * Hashing ở đây sẽ dẫn tới double-hashing khi User.create() được gọi
 */
class UserFactory {
  /**
   * Tạo một người dùng (password sẽ được hash bởi pre-save hook)
   * @param {Object} overrides - Dữ liệu override mặc định
   */
  static async create(overrides = {}) {
    return {
      username: overrides.username || `user_${Date.now()}`,
      email: overrides.email || `user_${Date.now()}@example.com`,
      password: overrides.password || '123456',
      role: overrides.role || 'user',
      profileImage: overrides.profileImage || null,
    };
  }

  /**
   * Tạo nhiều người dùng cùng lúc
   * @param {Number} count - Số lượng user muốn tạo
   * @param {Object} overrides - Dữ liệu override mặc định
   */
  static async createMany(count = 3, overrides = {}) {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push(await this.create({
        ...overrides,
        username: overrides.username || `user${i + 1}`,
        email: overrides.email || `user${i + 1}@example.com`,
      }));
    }
    return users;
  }
}

module.exports = UserFactory;
