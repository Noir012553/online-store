/**
 * API Routes - Định tuyến các endpoint
 * Kết nối controllers với HTTP methods (GET, POST, PUT, DELETE)
 * Bao gồm middleware xác thực, phân quyền
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getDeletedProducts,
  hardDeleteProduct,
  getTopRatedProducts,
  getStatsOverview,
  getTestimonials,
} = require('../controllers/productController');
const { uploadToCloudinary } = require('../services/cloudinaryService');
const {
  importProducts,
  importProductsFromFile,
  getImportTemplate,
  getImportGuide,
  getImportFormats,
  exportProducts,
  getExportStats,
} = require('../controllers/productImportController');
const { getProductTranslations } = require('../controllers/translationController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { getImportUploadMiddleware } = require('../utils/uploadConfig');

// Create upload middleware for import files (JSON, CSV)
const importUpload = getImportUploadMiddleware();

/**
 * GET /api/products/stats/overview - Lấy thống kê chung cửa hàng
 */
router.get('/stats/overview', getStatsOverview);

/**
 * GET /api/products/testimonials/featured - Lấy testimonials từ reviews
 */
router.get('/testimonials/featured', getTestimonials);

/**
 * GET /api/products/top/rated - Lấy sản phẩm được đánh giá cao nhất
 */
router.get('/top/rated', getTopRatedProducts);

/**
 * GET /api/products/featured - Lấy sản phẩm tối ưu (không populate reviews)
 * Dùng cho home page để tránh timeout khi fetch nhiều products
 */
router.get('/featured/list', getFeaturedProducts);

/**
 * GET /api/products - Lấy danh sách sản phẩm (phân trang, tìm kiếm, lọc)
 * POST /api/products - Tạo sản phẩm mới (Admin only, upload ảnh bắt buộc)
 */
/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: Lấy danh sách sản phẩm
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema: { type: integer }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Product' }
 *                 page: { type: integer }
 *                 pages: { type: integer }
 *                 total: { type: integer }
 */
router.route('/')
  .get(getProducts)
  .post(protect, admin, upload.single('image'), createProduct);

/**
 * GET /api/products/deleted/list - Lấy danh sách sản phẩm đã xóa (Admin only)
 */
router.get('/deleted/list', protect, admin, getDeletedProducts);

/**
 * GET /api/products/:id/translations - Lấy bản dịch sản phẩm theo ngôn ngữ
 * Query params: lang (default: 'en')
 */
router.get('/:id/translations', getProductTranslations);

/**
 * GET /api/products/:id - Lấy chi tiết sản phẩm
 * PUT /api/products/:id - Cập nhật sản phẩm (Admin only)
 * DELETE /api/products/:id - Xóa mềm sản phẩm (Admin only)
 */
/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Lấy chi tiết sản phẩm theo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       404:
 *         description: Không tìm thấy sản phẩm
 */
router.route('/:id')
  .get(getProductById)
  .put(protect, admin, upload.single('image'), updateProduct)
  .delete(protect, admin, deleteProduct);

/**
 * PUT /api/products/:id/restore - Khôi phục sản phẩm đã xóa (Admin only)
 */
router.put('/:id/restore', protect, admin, restoreProduct);

/**
 * DELETE /api/products/:id/hard - Xóa cứng sản phẩm (Admin only)
 * Xóa vĩnh viễn khỏi database và Cloudinary
 * Soft delete (mark isDeleted=true) dành cho regular admin
 * Hard delete (vĩnh viễn xóa + cleanup file) dành cho admin/super-admin
 */
router.delete('/:id/hard', protect, admin, hardDeleteProduct);

/**
 * POST /api/products/admin/import - Import products từ JSON/CSV text data
 * Admin only - Hỗ trợ insert, update, upsert modes
 */
router.post('/admin/import', protect, admin, importProducts);

/**
 * POST /api/products/admin/import-file - Import products từ file upload (FormData)
 * Admin only - Hỗ trợ insert, update, upsert modes
 * Accepts multipart/form-data with file field (JSON or CSV, max 10MB)
 */
router.post('/admin/import-file', protect, admin, importUpload.single('file'), importProductsFromFile);

/**
 * GET /api/products/admin/import-template - Lấy template import
 * Admin only
 */
router.get('/admin/import-template', protect, admin, getImportTemplate);

/**
 * GET /api/products/admin/import-guide - Lấy hướng dẫn import
 * Admin only
 */
router.get('/admin/import-guide', protect, admin, getImportGuide);

/**
 * GET /api/products/admin/import-formats - Lấy list supported formats
 * Admin only
 */
router.get('/admin/import-formats', protect, admin, getImportFormats);

/**
 * GET /api/products/admin/export - Export products từ database
 * Admin only - Hỗ trợ JSON, CSV formats
 */
router.get('/admin/export', protect, admin, exportProducts);

/**
 * GET /api/products/admin/export-stats - Lấy thống kê export
 * Admin only - Dùng để hiển thị available categories, brands, suppliers
 */
router.get('/admin/export-stats', protect, admin, getExportStats);

/**
 * POST /api/products/upload - Tải lên ảnh sản phẩm lên Cloudinary (Admin only)
 * Returns: { image: Cloudinary URL, publicId: Cloudinary public ID }
 */
router.post('/upload', protect, admin, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    const folder = req.user.role === 'admin' || req.user.role === 'super-admin' ? 'admins' : 'users';
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, folder);

    res.json({
      image: cloudinaryResult.url,
      publicId: cloudinaryResult.publicId,
      url: cloudinaryResult.url,
      success: true,
    });
  } catch (error) {
    console.error('[UPLOAD_ERROR]', error);
    res.status(500).json({
      error: 'Failed to upload image to Cloudinary',
      message: error.message,
    });
  }
}));


module.exports = router;
