const StaticTranslation = require('../models/StaticTranslation');
const { flattenJson } = require('../utils/jsonFlattener');

// Messages nested structure (same as frontend)
const messagesNested = {
  VI: {
    common: {
      contact: {
        hotline: '1900 1234',
        phone: '0901234567',
        email: 'info@laptopstore.vn',
      },
      ui: {
        commandPalette: 'Bảng lệnh',
        searchCommand: 'Tìm kiếm lệnh...',
        previous: 'Trước',
        next: 'Tiếp',
      },
      pagination: {
        previous: 'Trước',
        next: 'Tiếp',
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
        title: 'Dịch Tính Năng Sản Phẩm',
        subtitle: 'Quản lý dịch tiếng Anh cho các tính năng sản phẩm',
        search_placeholder: 'Tìm kiếm sản phẩm...',
        loading: 'Đang tải...',
        no_products: 'Không có sản phẩm nào',
        features_count: 'tính năng',
        translated_percent: 'Đã dịch',
        edit_button: 'Sửa dịch',
        cancel_button: 'Hủy',
        save_button: 'Lưu dịch',
        saving_button: 'Đang lưu...',
        feature_label: 'Tính năng {index} (Tiếng Việt)',
        english_translation_label: 'Bản dịch tiếng Anh',
        english_translation_placeholder: 'VD: Thương hiệu chính hãng, Bảo hành 24 tháng...',
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
    common: {
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

async function seedI18nMessages() {
  try {
    console.log('[i18nMessagesSeeder] Starting to seed i18n messages...');

    // For each language
    for (const [lang, namespaces] of Object.entries(messagesNested)) {
      // For each namespace
      for (const [namespace, translations] of Object.entries(namespaces)) {
        // Flatten nested object to dot-notation
        const flattenedTranslations = flattenJson(translations);

        // Check if exists
        const existing = await StaticTranslation.findOne({
          code: lang,
          namespace: namespace,
        });

        if (existing) {
          // Update
          await StaticTranslation.updateOne(
            { code: lang, namespace: namespace },
            { translations: flattenedTranslations }
          );
          console.log(`[i18nMessagesSeeder] Updated ${lang}/${namespace}`);
        } else {
          // Create
          await StaticTranslation.create({
            code: lang,
            namespace: namespace,
            translations: flattenedTranslations,
            isDeleted: false,
          });
          console.log(`[i18nMessagesSeeder] Created ${lang}/${namespace}`);
        }
      }
    }

    console.log('[i18nMessagesSeeder] ✅ Done seeding i18n messages');
  } catch (error) {
    console.error('[i18nMessagesSeeder] Error:', error);
    throw error;
  }
}

module.exports = seedI18nMessages;
