/**
 * Centralized internationalization (i18n) messages
 * Tất cả hard-coded text được quản lý tập trung ở đây
 * Hỗ trợ đa ngôn ngữ: VI (tiếng Việt) là default, EN (English) cho tương lai
 */

const messages = {
  VI: {
    // ============= EMAIL TEMPLATES =============
    email: {
      verification: {
        subject: 'Xác minh email tài khoản của bạn - LaptopStore',
        title: 'Xác Minh Email',
        thankYou: 'Cảm ơn bạn đã đăng ký tài khoản trên LaptopStore!',
        instruction: 'Vui lòng nhấp vào nút dưới đây để xác minh email của bạn:',
        button: 'Xác Minh Email',
        linkText: 'Hoặc copy link này vào trình duyệt:',
        expiry: 'Link này sẽ hết hạn sau 30 phút.',
        ignore: 'Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      resetPassword: {
        subject: 'Đặt lại mật khẩu - LaptopStore',
        title: 'Đặt Lại Mật Khẩu',
        received: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
        instruction: 'Nhấp vào nút dưới đây để tạo mật khẩu mới:',
        button: 'Đặt Lại Mật Khẩu',
        linkText: 'Hoặc copy link này vào trình duyệt:',
        expiry: 'Link này sẽ hết hạn sau 30 phút.',
        ignore: 'Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      otp: {
        subject: 'Mã OTP của bạn - LaptopStore',
        title: 'Mã Xác Minh',
        description: 'Đây là mã OTP để xác minh danh tính của bạn.',
        expiry: 'Mã này sẽ hết hạn sau 10 phút.',
        ignore: 'Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      newsletter: {
        subject: 'Cảm ơn bạn đã đăng ký - Nhận ưu đãi độc quyền ngay!',
        title: '🎉 Cảm Ơn Bạn Đã Đăng Ký Newsletter!',
        greeting: 'Chào bạn,',
        thankYou: 'Cảm ơn bạn đã đăng ký newsletter của LaptopStore! Chúng tôi rất vui được kết nối với bạn.',
        promises: 'Điều Chúng Tôi Hứa Với Bạn',
        promise1: '📧 Ưu đãi độc quyền cho khách hàng newsletter',
        promise2: '🚀 Sản phẩm mới nhất được thông báo trước',
        promise3: '💰 Giảm giá đặc biệt cho các sản phẩm yêu thích',
        promise4: '📱 Hỗ trợ ưu tiên từ đội ngũ chúng tôi',
        content: 'Chúng tôi sẽ gửi những tin tức mới nhất, khuyến mãi độc quyền và những cập nhật sản phẩm tới email của bạn. Hãy chú ý inbox của bạn trong những ngày tới!',
        unsubscribe: 'Nếu bạn muốn thay đổi tùy chọn email hoặc hủy đăng ký, bạn có thể tìm thấy liên kết hủy đăng ký ở dưới cùng của mỗi email từ chúng tôi.',
        copyright: '© 2024 LaptopStore. Tất cả các quyền được bảo lưu.',
      },
    },

    // ============= VALIDATION MESSAGES =============
    validation: {
      email: {
        required: 'Email là bắt buộc',
        invalid: 'Email không hợp lệ',
      },
      password: {
        required: 'Mật khẩu là bắt buộc',
        minLength: 'Mật khẩu phải ít nhất 6 ký tự',
      },
      name: {
        lengthRange: 'Tên phải từ 1 đến 100 ký tự',
      },
      phone: {
        invalid: 'Số điện thoại phải từ 10-11 chữ số',
      },
      address: {
        maxLength: 'Địa chỉ không được vượt quá 255 ký tự',
      },
      cart: {
        empty: 'Giỏ hàng không được để trống',
      },
      product: {
        idRequired: 'ID sản phẩm là bắt buộc',
      },
      quantity: {
        invalid: 'Số lượng phải là số nguyên dương',
      },
      shipping: {
        addressRequired: 'Địa chỉ giao hàng là bắt buộc',
        provinceRequired: 'provinceId là bắt buộc',
        weightInvalid: 'Cân nặng phải lớn hơn 0',
      },
      customer: {
        nameInvalid: 'Tên khách hàng phải từ 1 đến 100 ký tự',
      },
    },

    // ============= AUTH ERRORS =============
    auth: {
      invalidTokenType: 'Invalid token type',
      userNotFound: 'User not found or account has been deleted',
      notAuthorized: 'Not authorized, token failed',
      noToken: 'Not authorized, no token',
      notAdminAuth: 'Not authorized as an admin',
      notSuperAdminAuth: 'Not authorized as a super admin',
      logoutSuccess: 'Đã đăng xuất thành công',
      invalidEmailPassword: 'Email hoặc mật khẩu không hợp lệ',
      tokenRevoked: 'Token has been revoked. Please login again.',
    },

    // ============= PAYMENT MESSAGES =============
    payment: {
      readyForPayment: 'Ready for payment',
      missingOrderId: 'Missing orderId',
      devModeOnly: 'This endpoint is only available in development mode',
      missingFields: 'Missing required fields',
      amountInvalid: 'Amount must be a positive number',
      amountNoDecimal: 'Amount must be an integer (no decimal)',
      orderNotFound: 'Order not found',
      orderAlreadyPaid: 'Order is already paid',
      ipCheckFailed: 'Cannot determine client IP from Cloudflare',
    },

    // ============= TRANSLATION MESSAGES =============
    translation: {
      productIdRequired: 'Product ID is required',
      cacheNotFound: 'Cache record not found',
      updated: 'Translation updated',
    },

    // ============= USER MESSAGES =============
    user: {
      invalidData: 'Invalid user data',
      notFound: 'User not found',
      alreadyExists: 'User already exists',
      hardDeleteSuccess: 'User permanently removed',
      notDeleted: 'User is not deleted',
      restoreSuccess: 'User restored successfully',
    },

    // ============= ORDER MESSAGES =============
    order: {
      notFound: 'Không tìm thấy đơn hàng',
      cartEmpty: 'Giỏ hàng không được để trống',
      noCartItems: 'Không có sản phẩm trong giỏ hàng. Vui lòng cung cấp cartItems array với {productId, quantity}',
      invalidPromoCode: 'Mã giảm giá không hợp lệ hoặc đã hết hạn',
      couponExpired: 'Mã giảm giá đã hết hạn',
      couponLimitExceeded: 'Mã giảm giá đã hết lượt sử dụng',
      couponMinAmount: 'Đơn hàng phải tối thiểu {amount} để sử dụng mã này',
      statusInvalid: 'Trạng thái đơn hàng không hợp lệ',
      notAuthorized: 'Bạn không có quyền xem đơn hàng này',
      alreadyDeleted: 'Đơn hàng đã bị xóa',
      notDeleted: 'Đơn hàng chưa bị xóa',
      deleteSuccess: 'Đơn hàng đã bị xóa',
      permanentDeleteSuccess: 'Đơn hàng đã bị xóa vĩnh viễn',
    },

    // ============= SHIPMENT MESSAGES =============
    shipment: {
      notFound: 'Không tìm thấy thông tin vận chuyển',
      alreadyCreated: 'Vận đơn đã được tạo cho đơn hàng này',
      invalidProvider: 'Nhà vận chuyển không được cấu hình',
      missingInfo: 'Thông tin địa chỉ giao hàng không đủ',
      noServiceAvailable: 'Không có dịch vụ vận chuyển nào khả dụng cho tuyến đường này. Vui lòng kiểm tra địa chỉ giao hàng.',
      unsupportedCarrier: 'Nhà vận chuyển chưa được hỗ trợ',
      requiredFields: 'orderId, shippingProvider, shippingService là bắt buộc',
      createSuccess: 'Vận đơn đã được tạo thành công',
      cancelSuccess: 'Vận đơn đã được hủy',
      invalidStatus: 'Không thể hủy vận đơn có trạng thái {status}',
    },

    // ============= ADDRESS MESSAGES =============
    address: {
      notFound: 'Địa chỉ không tồn tại',
      customerRequired: 'customerId là bắt buộc',
      customerNotFound: 'Khách hàng không tồn tại',
      missingFields: 'Vui lòng cung cấp đầy đủ thông tin',
      createSuccess: 'Địa chỉ được tạo thành công',
      updateSuccess: 'Địa chỉ được cập nhật thành công',
      deleteSuccess: 'Địa chỉ được xóa thành công',
      provinceRequired: 'Vui lòng chọn Tỉnh/Thành phố',
      districtRequired: 'Vui lòng chọn Quận/Huyện',
      wardRequired: 'Vui lòng chọn Phường/Xã',
    },

    // ============= PRODUCT MESSAGES =============
    product: {
      notFound: 'Sản phẩm không tồn tại',
      outOfStock: 'Sản phẩm này hiện đã hết hàng',
      insufficientStock: 'Hàng không đủ cho sản phẩm {name}. Còn: {available}, Yêu cầu: {requested}',
      imageRequired: 'Hình ảnh sản phẩm là bắt buộc',
      priceInvalid: 'Giá phải là số hợp lệ và lớn hơn 0',
      stockInvalid: 'Số lượng hàng phải là số hợp lệ và >= 0',
      alreadyDeleted: 'Sản phẩm đã bị xóa',
      deleteSuccess: 'Sản phẩm đã bị xóa',
      updateSuccess: 'Sản phẩm được cập nhật thành công',
      skuExists: 'Mã SKU sản phẩm đã tồn tại',
      limitExceeded: 'Số lượng mua vượt quá giới hạn cho phép',
      customerNameRequired: 'Tên khách hàng là bắt buộc khi chỉ cung cấp email',
      fieldInUse: '{field} đã được sử dụng bởi khách hàng khác',
    },

    // ============= SHIPPING MESSAGES =============
    shipping: {
      sameDistrictFree: 'Cùng quận - Miễn phí vận chuyển',
      provinceIdRequired: 'provinceId là bắt buộc',
      weightMustBePositive: 'Cân nặng phải lớn hơn 0',
    },

    // ============= API MESSAGES =============
    api: {
      backendRunning: 'Laptop Store Backend API is running!',
      emailRequired: 'Email is required',
      subscriberNotFound: 'Subscriber not found',
    },

    // ============= ERROR HANDLER MESSAGES (Frontend) =============
    errors: {
      serverError: 'Server error',
      networkError: 'Network error',
      tooManyRequests: 'Too many requests',
      requestTaking: 'Request is taking time...',
    },

    // ============= CONTACT INFO =============
    contact: {
      hotline: '1900 1234',
      phone: '0901234567',
      email: 'info@laptopstore.vn',
    },

    // ============= UI LABELS =============
    ui: {
      previous: 'Previous',
      next: 'Next',
      commandPalette: 'Command Palette',
      searchCommand: 'Search for a command...',
      jsonFormat: 'JSON',
      csvFormat: 'CSV',
      importLabel: '📁 1.',
    },

    // ============= SEED DATA =============
    seed: {
      superAdminEmail: 'superadmin@laptop.com',
      adminPassword: 'admin123',
      providerDescription: 'Dịch vụ vận chuyển Giao Hàng Nhanh',
    },

    // ============= CATEGORIES =============
    categories: {
      keyboard: 'Bàn phím',
      mouse: 'Chuột',
      gamingLaptop: 'Laptop Gaming',
    },

    // ============= FRONTEND - GENERAL UI =============
    frontend: {
      contact: {
        hotline: '1900 1234',
        phone: '0901234567',
        email: 'info@laptopstore.vn',
      },
      ui: {
        commandPalette: 'Command Palette',
        searchCommand: 'Search for a command...',
        previous: 'Previous',
        next: 'Next',
      },
      pagination: {
        previous: 'Previous',
        next: 'Next',
      },
      errors: {
        server_error: 'Lỗi máy chủ',
        network_error: 'Lỗi kết nối',
        too_many_requests: 'Quá nhiều yêu cầu',
        request_timeout: 'Yêu cầu hết thời gian chờ',
        request_processing: 'Yêu cầu đang xử lý...',
      },
      import: {
        max_file_size_error: 'Kích thước file tối đa là 10MB',
        invalid_file_error: 'Định dạng file không hợp lệ. Chỉ hỗ trợ JSON và CSV',
        import_success: 'Nhập sản phẩm thành công',
        import_failed: 'Nhập sản phẩm thất bại',
        upload_failed: 'Tải file lên thất bại',
        importing: 'Đang nhập...',
        file_format_json: 'JSON',
        file_format_csv: 'CSV',
        mode_insert: 'Thêm mới',
        mode_update: 'Cập nhật',
        mode_upsert: 'Thêm hoặc cập nhật',
        dry_run_label: 'Xem trước (không thay đổi dữ liệu)',
        download_template: 'Tải template',
        select_file: 'Chọn file',
        submit_import: 'Nhập sản phẩm',
      },
      dashboard: {
        in_stock: 'trong kho',
      },
      productsTranslations: {
        title: 'Dịch Features Sản Phẩm',
        subtitle: 'Quản lý dịch tiếng Anh cho các features sản phẩm',
        search_placeholder: 'Tìm kiếm sản phẩm...',
        loading: 'Đang tải...',
        no_products: 'Không có sản phẩm nào',
        features_count: 'features',
        translated_percent: 'Dịch xong',
        edit_button: 'Sửa dịch',
        cancel_button: 'Hủy',
        save_button: 'Lưu dịch',
        saving_button: 'Đang lưu...',
        feature_label: 'Feature {index} (Tiếng Việt)',
        english_translation_label: 'Dịch tiếng Anh',
        english_translation_placeholder: 'e.g., Authentic Brand, 24 Month Warranty...',
        translated_badge: 'Đã dịch',
        not_translated_badge: 'Chưa dịch',
        clear_translation_button: 'Xóa dịch',
        save_success: 'Cập nhật dịch thành công!',
        load_failed: 'Không thể tải sản phẩm',
        save_failed: 'Lỗi cập nhật',
      },
    },
  },

  EN: {
    // ============= EMAIL TEMPLATES =============
    email: {
      verification: {
        subject: 'Verify your account email - LaptopStore',
        title: 'Email Verification',
        thankYou: 'Thank you for signing up at LaptopStore!',
        instruction: 'Please click the button below to verify your email:',
        button: 'Verify Email',
        linkText: 'Or copy this link into your browser:',
        expiry: 'This link will expire in 30 minutes.',
        ignore: 'If you did not sign up for this account, please ignore this email.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      resetPassword: {
        subject: 'Reset your password - LaptopStore',
        title: 'Reset Password',
        received: 'We received a request to reset the password for your account.',
        instruction: 'Click the button below to create a new password:',
        button: 'Reset Password',
        linkText: 'Or copy this link into your browser:',
        expiry: 'This link will expire in 30 minutes.',
        ignore: 'If you did not request a password reset, please ignore this email.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      otp: {
        subject: 'Your OTP code - LaptopStore',
        title: 'Verification Code',
        description: 'This is your OTP to verify your identity.',
        expiry: 'This code will expire in 10 minutes.',
        ignore: 'If you did not request this code, please ignore this email.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
      newsletter: {
        subject: 'Thank you for subscribing - Get exclusive offers now!',
        title: '🎉 Thank You For Subscribing To Our Newsletter!',
        greeting: 'Hello,',
        thankYou: 'Thank you for subscribing to LaptopStore newsletter! We are excited to connect with you.',
        promises: 'What We Promise You',
        promise1: '📧 Exclusive offers for newsletter customers',
        promise2: '🚀 Latest products announced first',
        promise3: '💰 Special discounts on your favorite products',
        promise4: '📱 Priority support from our team',
        content: 'We will send you the latest news, exclusive promotions and product updates to your email. Keep an eye on your inbox in the coming days!',
        unsubscribe: 'If you want to change your email preferences or unsubscribe, you can find the unsubscribe link at the bottom of each email from us.',
        copyright: '© 2024 LaptopStore. All rights reserved.',
      },
    },

    // ============= VALIDATION MESSAGES =============
    validation: {
      email: {
        required: 'Email is required',
        invalid: 'Invalid email',
      },
      password: {
        required: 'Password is required',
        minLength: 'Password must be at least 6 characters',
      },
      name: {
        lengthRange: 'Name must be between 1 and 100 characters',
      },
      phone: {
        invalid: 'Phone number must be 10-11 digits',
      },
      address: {
        maxLength: 'Address must not exceed 255 characters',
      },
      cart: {
        empty: 'Cart cannot be empty',
      },
      product: {
        idRequired: 'Product ID is required',
      },
      quantity: {
        invalid: 'Quantity must be a positive integer',
      },
      shipping: {
        addressRequired: 'Shipping address is required',
        provinceRequired: 'Province ID is required',
        weightInvalid: 'Weight must be greater than 0',
      },
      customer: {
        nameInvalid: 'Customer name must be between 1 and 100 characters',
      },
    },

    // ============= AUTH ERRORS =============
    auth: {
      invalidTokenType: 'Invalid token type',
      userNotFound: 'User not found or account has been deleted',
      notAuthorized: 'Not authorized, token failed',
      noToken: 'Not authorized, no token',
      notAdminAuth: 'Not authorized as an admin',
      notSuperAdminAuth: 'Not authorized as a super admin',
      logoutSuccess: 'Logged out successfully',
      invalidEmailPassword: 'Invalid email or password',
      tokenRevoked: 'Token has been revoked. Please login again.',
    },

    // ============= PAYMENT MESSAGES =============
    payment: {
      readyForPayment: 'Ready for payment',
      missingOrderId: 'Missing orderId',
      devModeOnly: 'This endpoint is only available in development mode',
      missingFields: 'Missing required fields',
      amountInvalid: 'Amount must be a positive number',
      amountNoDecimal: 'Amount must be an integer (no decimal)',
      orderNotFound: 'Order not found',
      orderAlreadyPaid: 'Order is already paid',
      ipCheckFailed: 'Cannot determine client IP from Cloudflare',
    },

    // ============= TRANSLATION MESSAGES =============
    translation: {
      productIdRequired: 'Product ID is required',
      cacheNotFound: 'Cache record not found',
      updated: 'Translation updated',
    },

    // ============= USER MESSAGES =============
    user: {
      invalidData: 'Invalid user data',
      notFound: 'User not found',
      alreadyExists: 'User already exists',
      hardDeleteSuccess: 'User permanently removed',
      notDeleted: 'User is not deleted',
      restoreSuccess: 'User restored successfully',
    },

    // ============= ORDER MESSAGES =============
    order: {
      notFound: 'Order not found',
      cartEmpty: 'Cart cannot be empty',
      noCartItems: 'No products in cart. Expected: cartItems array with {productId, quantity}',
      invalidPromoCode: 'Promo code is invalid or expired',
      couponExpired: 'Coupon has expired',
      couponLimitExceeded: 'Coupon usage limit exceeded',
      couponMinAmount: 'Order must be at least {amount} to use this coupon',
      statusInvalid: 'Invalid order status',
      notAuthorized: 'Not authorized to view this order',
      alreadyDeleted: 'Order already deleted',
      notDeleted: 'Order is not deleted',
      deleteSuccess: 'Order deleted',
      permanentDeleteSuccess: 'Order permanently deleted',
    },

    // ============= SHIPMENT MESSAGES =============
    shipment: {
      notFound: 'Shipment not found',
      alreadyCreated: 'Shipment already created for this order',
      invalidProvider: 'Shipping provider is not configured',
      missingInfo: 'Shipping address information is incomplete',
      noServiceAvailable: 'No shipping service available for this route. Please check shipping address.',
      unsupportedCarrier: 'Carrier not supported',
      requiredFields: 'orderId, shippingProvider, shippingService are required',
      createSuccess: 'Shipment created successfully',
      cancelSuccess: 'Shipment cancelled',
      invalidStatus: 'Cannot cancel shipment with status {status}',
    },

    // ============= ADDRESS MESSAGES =============
    address: {
      notFound: 'Address not found',
      customerRequired: 'customerId is required',
      customerNotFound: 'Customer not found',
      missingFields: 'Please provide all required information',
      createSuccess: 'Address created successfully',
      updateSuccess: 'Address updated successfully',
      deleteSuccess: 'Address deleted successfully',
      provinceRequired: 'Please select Province',
      districtRequired: 'Please select District',
      wardRequired: 'Please select Ward',
    },

    // ============= PRODUCT MESSAGES =============
    product: {
      notFound: 'Product not found',
      outOfStock: 'This product is currently out of stock',
      insufficientStock: 'Insufficient stock for {name}. Available: {available}, Requested: {requested}',
      imageRequired: 'Product image is required',
      priceInvalid: 'Price must be a valid number greater than 0',
      stockInvalid: 'Stock quantity must be a valid number >= 0',
      alreadyDeleted: 'Product already deleted',
      deleteSuccess: 'Product deleted',
      updateSuccess: 'Product updated successfully',
      skuExists: 'SKU already exists',
      limitExceeded: 'Purchase quantity exceeds limit',
      customerNameRequired: 'Customer name is required when only email is provided',
      fieldInUse: '{field} already in use by another customer',
    },

    // ============= SHIPPING MESSAGES =============
    shipping: {
      sameDistrictFree: 'Same district - Free shipping',
      provinceIdRequired: 'Province ID is required',
      weightMustBePositive: 'Weight must be greater than 0',
    },

    // ============= API MESSAGES =============
    api: {
      backendRunning: 'Laptop Store Backend API is running!',
      emailRequired: 'Email is required',
      subscriberNotFound: 'Subscriber not found',
    },

    // ============= ERROR HANDLER MESSAGES (Frontend) =============
    errors: {
      serverError: 'Server error',
      networkError: 'Network error',
      tooManyRequests: 'Too many requests',
      requestTaking: 'Request is taking time...',
    },

    // ============= CONTACT INFO =============
    contact: {
      hotline: '1900 1234',
      phone: '0901234567',
      email: 'info@laptopstore.vn',
    },

    // ============= UI LABELS =============
    ui: {
      previous: 'Previous',
      next: 'Next',
      commandPalette: 'Command Palette',
      searchCommand: 'Search for a command...',
      jsonFormat: 'JSON',
      csvFormat: 'CSV',
      importLabel: '📁 1.',
    },

    // ============= SEED DATA =============
    seed: {
      superAdminEmail: 'superadmin@laptop.com',
      adminPassword: 'admin123',
      providerDescription: 'Giao Hàng Nhanh shipping service',
    },

    // ============= CATEGORIES =============
    categories: {
      keyboard: 'Keyboard',
      mouse: 'Mouse',
      gamingLaptop: 'Gaming Laptop',
    },

    // ============= FRONTEND - GENERAL UI =============
    frontend: {
      contact: {
        hotline: '1900 1234',
        phone: '0901234567',
        email: 'info@laptopstore.vn',
      },
      ui: {
        commandPalette: 'Command Palette',
        searchCommand: 'Search for a command...',
        previous: 'Previous',
        next: 'Next',
      },
      pagination: {
        previous: 'Previous',
        next: 'Next',
      },
      errors: {
        server_error: 'Server error',
        network_error: 'Network error',
        too_many_requests: 'Too many requests',
        request_timeout: 'Request timeout',
        request_processing: 'Request is processing...',
      },
      import: {
        max_file_size_error: 'Maximum file size is 10MB',
        invalid_file_error: 'Invalid file format. Only JSON and CSV are supported',
        import_success: 'Products imported successfully',
        import_failed: 'Failed to import products',
        upload_failed: 'Failed to upload file',
        importing: 'Importing...',
        file_format_json: 'JSON',
        file_format_csv: 'CSV',
        mode_insert: 'Insert',
        mode_update: 'Update',
        mode_upsert: 'Insert or Update',
        dry_run_label: 'Preview (no data changes)',
        download_template: 'Download template',
        select_file: 'Select file',
        submit_import: 'Import products',
      },
      dashboard: {
        in_stock: 'in stock',
      },
      productsTranslations: {
        title: 'Product Features Translations',
        subtitle: 'Manage English translations for product features',
        search_placeholder: 'Search products...',
        loading: 'Loading...',
        no_products: 'No products found',
        features_count: 'features',
        translated_percent: 'Translated',
        edit_button: 'Edit translations',
        cancel_button: 'Cancel',
        save_button: 'Save translations',
        saving_button: 'Saving...',
        feature_label: 'Feature {index} (Vietnamese)',
        english_translation_label: 'English Translation',
        english_translation_placeholder: 'e.g., Authentic Brand, 24 Month Warranty...',
        translated_badge: 'Translated',
        not_translated_badge: 'Not translated',
        clear_translation_button: 'Clear translation',
        save_success: 'Translations updated successfully!',
        load_failed: 'Failed to load products',
        save_failed: 'Update failed',
      },
    },
  },
};

/**
 * Get message by language and path
 * Usage: getMessage('VI', 'email.verification.subject')
 * @param {String} lang - Language code (VI, EN)
 * @param {String} path - Dot-notation path to message
 * @returns {String} Message or fallback to English
 */
const getMessage = (lang = 'VI', path) => {
  const langMessages = messages[lang] || messages['VI'];
  const keys = path.split('.');
  let result = langMessages;

  for (const key of keys) {
    result = result?.[key];
    if (!result) break;
  }

  // Fallback to English if not found in requested language
  if (!result && lang !== 'EN') {
    const enMessages = messages['EN'];
    let enResult = enMessages;
    for (const key of keys) {
      enResult = enResult?.[key];
      if (!enResult) break;
    }
    return enResult || path;
  }

  return result || path;
};

module.exports = {
  messages,
  getMessage,
};
