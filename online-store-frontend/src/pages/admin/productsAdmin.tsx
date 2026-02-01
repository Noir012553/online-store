import { useState, useEffect } from "react";
import { Search, Plus, Pencil, Trash2, Upload, RotateCcw, AlertCircle, CheckCircle2, Package, DollarSign } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import { productAPI } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { toast } from "sonner";
import AdminLayout from "./adminLayout";
import { Pagination } from "../../components/admin/Pagination";

function ProductsAdminContent() {
  const [laptops, setLaptops] = useState<any[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<any>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedProducts();
    } else {
      fetchProducts();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab]);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getProducts(1, undefined, undefined, undefined, 1000);
      const products = response.products || [];
      setLaptops(products);
    } catch (error) {
      toast.error("Không thể tải danh sách sản phẩm");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedProducts = async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getDeletedProducts(deletedCurrentPage, 1000);
      const products = response.products || [];
      setDeletedProducts(products);
    } catch (error) {
      toast.error("Không thể tải danh sách sản phẩm đã xóa");
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredProducts = () => {
    const listToFilter = viewDeletedTab ? deletedProducts : laptops;
    return listToFilter.filter((laptop) => {
      const matchesSearch =
        laptop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        laptop.brand?.toLowerCase().includes(searchQuery.toLowerCase());

      if (viewDeletedTab) return matchesSearch;

      const categoryName = laptop.category?.name || "";
      const matchesCategory = filterCategory === "all" || categoryName === filterCategory;
      const matchesBrand = filterBrand === "all" || laptop.brand === filterBrand;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  };

  const filteredLaptops = getFilteredProducts();
  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const totalPages = Math.ceil(filteredLaptops.length / itemsPerPage);
  const paginatedLaptops = filteredLaptops.slice(
    (currentPageVar - 1) * itemsPerPage,
    currentPageVar * itemsPerPage
  );

  const handleEdit = (laptop: any) => {
    setEditingProduct({ ...laptop });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingProduct({
      name: "",
      brand: "",
      category: "",
      price: 0,
      image: "",
      rating: 0,
      numReviews: 0,
      countInStock: 0,
      description: "",
      featured: false,
    });
    setImageFile(null);
    setImagePreview("");
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!editingProduct.name || !editingProduct.brand || !editingProduct.price) {
        toast.error("Vui lòng điền đầy đủ thông tin bắt buộc (Tên, Hãng, Giá)");
        return;
      }

      setIsSubmitting(true);

      if (editingProduct._id) {
        // Update existing product
        const formData = new FormData();
        formData.append("name", editingProduct.name);
        formData.append("brand", editingProduct.brand);
        formData.append("category", editingProduct.category);
        formData.append("price", editingProduct.price);
        formData.append("description", editingProduct.description);
        formData.append("countInStock", editingProduct.countInStock);

        await productAPI.updateProduct(editingProduct._id, formData);
        toast.success("Cập nhật sản phẩm thành công!");
      } else {
        // Create new product - requires image file
        if (!imageFile) {
          toast.error("Vui lòng tải lên ảnh sản phẩm");
          setIsSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append("name", editingProduct.name);
        formData.append("brand", editingProduct.brand);
        formData.append("category", editingProduct.category);
        formData.append("price", editingProduct.price);
        formData.append("description", editingProduct.description);
        formData.append("countInStock", editingProduct.countInStock);
        formData.append("featured", editingProduct.featured ? "true" : "false");
        formData.append("image", imageFile);

        await productAPI.createProduct(formData);
        toast.success("Tạo sản phẩm mới thành công!");
      }
      setIsDialogOpen(false);
      setEditingProduct(null);
      setImageFile(null);
      setImagePreview("");
      await fetchProducts();
    } catch (error) {
      toast.error("Không thể lưu sản phẩm");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await productAPI.deleteProduct(id);
      if (viewDeletedTab) {
        await fetchDeletedProducts();
      } else {
        await fetchProducts();
      }
      toast.success("Xóa sản phẩm thành công!");
    } catch (error) {
      toast.error("Không thể xóa sản phẩm");
    }
  };

  const handleRestoreProduct = async (id: string) => {
    try {
      setIsSubmitting(true);
      await productAPI.restoreProduct(id);
      toast.success("Khôi phục sản phẩm thành công!");
      await fetchDeletedProducts();
    } catch (error) {
      toast.error("Không thể khôi phục sản phẩm");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDeleteProduct = async (id: string) => {
    try {
      setIsSubmitting(true);
      await fetch(`/api/products/${id}/hard`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').token : ''}`
        }
      });
      await fetchDeletedProducts();
      toast.success("Xóa vĩnh viễn sản phẩm thành công!");
      setDeleteConfirmProduct(null);
    } catch (error) {
      toast.error("Không thể xóa vĩnh viễn sản phẩm");
    } finally {
      setIsSubmitting(false);
    }
  };

  const brands = Array.from(new Set((viewDeletedTab ? deletedProducts : laptops).map((l) => l.brand).filter(Boolean)));
  const categories = Array.from(new Set((viewDeletedTab ? deletedProducts : laptops).map((l) => l.category?.name).filter(Boolean)));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1>Quản lý sản phẩm</h1>
        {!viewDeletedTab && (
          <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Thêm sản phẩm
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="border-b">
          <div className="flex gap-0">
            <button
              onClick={() => {
                setViewDeletedTab(false);
                setCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                !viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Sản phẩm hoạt động
            </button>
            <button
              onClick={() => {
                setViewDeletedTab(true);
                setDeletedCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Sản phẩm đã xóa
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Tìm kiếm sản phẩm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            {!viewDeletedTab && (
              <>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả danh mục</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Thương hiệu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả thương hiệu</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase">Sản phẩm</th>
                <th className="px-6 py-3 text-left text-xs uppercase">Hãng</th>
                <th className="px-6 py-3 text-left text-xs uppercase">Danh mục</th>
                <th className="px-6 py-3 text-left text-xs uppercase">Giá</th>
                {!viewDeletedTab && (
                  <>
                    <th className="px-6 py-3 text-left text-xs uppercase">Tình trạng</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Rating</th>
                  </>
                )}
                <th className="px-6 py-3 text-right text-xs uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedLaptops.map((laptop) => (
                <tr key={laptop._id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {laptop.image && (
                        <img
                          src={laptop.image}
                          alt={laptop.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <p className="font-medium">{laptop.name}</p>
                        {laptop.featured && (
                          <Badge className="mt-1 bg-red-600">Nổi bật</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{laptop.brand || "-"}</td>
                  <td className="px-6 py-4">{laptop.category?.name || "-"}</td>
                  <td className="px-6 py-4 font-medium">{formatCurrency(laptop.price)}</td>
                  {!viewDeletedTab && (
                    <>
                      <td className="px-6 py-4">
                        {laptop.countInStock === null || laptop.countInStock === undefined ? (
                          <Badge variant="secondary">Chưa cập nhật</Badge>
                        ) : (
                          <Badge variant={laptop.countInStock > 0 ? "default" : "destructive"}>
                            Còn {laptop.countInStock}
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(laptop.rating || 0).toFixed(1)} ⭐ ({laptop.numReviews})
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {viewDeletedTab ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreProduct(laptop._id)}
                            disabled={isSubmitting}
                            title="Khôi phục"
                          >
                            <RotateCcw className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmProduct(laptop)}
                            title="Xóa vĩnh viễn"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(laptop)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(laptop._id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPageVar}
            totalPages={totalPages}
            onPageChange={viewDeletedTab ? setDeletedCurrentPage : setCurrentPage}
          />
        )}
      </div>

      <Dialog open={!!deleteConfirmProduct} onOpenChange={() => setDeleteConfirmProduct(null)}>
        <DialogContent className="sm:max-w-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${viewDeletedTab ? 'bg-red-100' : 'bg-orange-100'}`}>
                <AlertCircle className={`h-6 w-6 ${viewDeletedTab ? 'text-red-600' : 'text-orange-600'}`} />
              </div>
              <DialogTitle className="text-lg font-semibold">
                {viewDeletedTab ? "Xóa vĩnh viễn sản phẩm" : "Xác nhận xóa sản phẩm"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {viewDeletedTab ? (
                <>Bạn có chắc chắn muốn xóa vĩnh viễn sản phẩm <span className="font-semibold text-gray-900">{deleteConfirmProduct?.name}</span>? <span className="text-red-600 font-medium">Hành động này không thể hoàn tác</span> và sẽ xóa hoàn toàn khỏi hệ thống.</>
              ) : (
                <>Bạn có chắc chắn muốn xóa sản phẩm <span className="font-semibold text-gray-900">{deleteConfirmProduct?.name}</span>? Bạn có thể khôi phục sau này.</>
              )}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex flex-row-reverse">
            <Button
              onClick={() => {
                if (deleteConfirmProduct) {
                  if (viewDeletedTab) {
                    handleHardDeleteProduct(deleteConfirmProduct._id);
                  } else {
                    handleDelete(deleteConfirmProduct._id);
                  }
                  setDeleteConfirmProduct(null);
                }
              }}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white flex-1"
            >
              {isSubmitting ? "Đang xóa..." : viewDeletedTab ? "Xóa vĩnh viễn" : "Xóa"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmProduct(null)}
              className="flex-1"
            >
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setImageFile(null);
          setImagePreview("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                {editingProduct?._id ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
              </DialogTitle>
            </div>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  Thông tin cơ bản
                </h3>
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tên sản phẩm <span className="text-red-500">*</span></Label>
                      <Input
                        value={editingProduct.name}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        placeholder="Nhập tên sản phẩm"
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Hãng</Label>
                      <Input
                        value={editingProduct.brand || ""}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, brand: e.target.value })
                        }
                        placeholder="Nhập hãng sản xuất"
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Danh mục</Label>
                    <Input
                      value={editingProduct.category?.name || ""}
                      disabled
                      className="bg-gray-100 text-gray-600"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  Giá & Tồn kho
                </h3>
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Giá (VND) <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        value={editingProduct.price}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            price: parseFloat(e.target.value),
                          })
                        }
                        placeholder="0"
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Số lượng tồn kho</Label>
                      <Input
                        type="number"
                        value={editingProduct.countInStock || 0}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            countInStock: parseInt(e.target.value),
                          })
                        }
                        placeholder="0"
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">Chi tiết</h3>
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Mô tả</Label>
                    <Textarea
                      value={editingProduct.description || ""}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, description: e.target.value })
                      }
                      rows={3}
                      placeholder="Nhập mô tả sản phẩm..."
                      className="transition-colors focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3 border-l-4 border-blue-600 bg-blue-50 rounded">
                    <Checkbox
                      id="featured"
                      checked={editingProduct.featured || false}
                      onCheckedChange={(checked) =>
                        setEditingProduct({ ...editingProduct, featured: checked })
                      }
                    />
                    <Label htmlFor="featured" className="cursor-pointer font-medium text-sm">
                      Đánh dấu sản phẩm nổi bật
                    </Label>
                  </div>
                </div>
              </div>

              {!editingProduct._id && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-600" />
                    Ảnh sản phẩm <span className="text-red-500">*</span>
                  </h3>
                  <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 hover:border-blue-500 bg-blue-50 transition-colors">
                    {imagePreview ? (
                      <div className="space-y-3">
                        <div className="flex justify-center">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-32 h-32 object-cover rounded-lg shadow-sm"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview("");
                          }}
                          className="w-full"
                        >
                          Thay đổi ảnh
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-200 mb-3">
                            <Upload className="w-6 h-6 text-blue-600" />
                          </div>
                          <p className="text-sm font-medium text-gray-700">Tải ảnh lên</p>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF (tối đa 5MB)</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setImageFile(file);
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setImagePreview(event.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 flex flex-row-reverse pt-6 border-t">
            <Button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white flex-1 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? "Đang lưu..." : (editingProduct?._id ? "Cập nhật" : "Tạo sản phẩm")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProductsAdmin() {
  return (
    <AdminLayout>
      <ProductsAdminContent />
    </AdminLayout>
  );
}
