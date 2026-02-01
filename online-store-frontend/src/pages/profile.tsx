import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Mail, Phone, MapPin, Lock, Edit2, Check, X } from 'lucide-react';

export default function Profile() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
      });
    }
  }, [user]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Vui lòng đăng nhập</h1>
          <Button onClick={() => router.push('/login')} className="bg-red-600 hover:bg-red-700">
            Đi đến trang đăng nhập
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    toast.success('Cập nhật thông tin thành công!');
    setIsEditing(false);
  };

  if (isAdmin) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="bg-linear-to-r from-red-600 to-red-700 px-8 py-12">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-red-600">{user.name[0]}</span>
                </div>
                <div className="text-white">
                  <h1 className="text-3xl font-bold">{user.name}</h1>
                  <p className="text-red-100">Quản trị viên</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h2 className="text-xl font-semibold mb-6">Thông tin cá nhân</h2>

                  <div className="space-y-6">
                    <div>
                      <Label className="text-gray-600">Họ tên</Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{user.name}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-600 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{user.email}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Số điện thoại
                      </Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{user.phone || 'Chưa cập nhật'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-6">Quyền hạn</h2>

                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800 font-semibold">✓ Quản lý sản phẩm</p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800 font-semibold">✓ Quản lý đơn hàng</p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800 font-semibold">✓ Quản lý khách hàng</p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800 font-semibold">✓ Xem dashboard</p>
                    </div>
                  </div>

                  <div className="mt-8">
                    <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4" />
                      Thay đổi mật khẩu
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User Profile
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="bg-linear-to-r from-gray-900 to-gray-800 px-8 py-12">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">{user.name[0]}</span>
                </div>
                <div className="text-white">
                  <h1 className="text-3xl font-bold">{user.name}</h1>
                  <p className="text-gray-300">Khách hàng</p>
                </div>
              </div>
              {!isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  className="text-white border-white hover:bg-white hover:text-gray-900"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Chỉnh sửa
                </Button>
              )}
            </div>
          </div>

          <div className="p-8">
            {isEditing ? (
              <div>
                <h2 className="text-2xl font-semibold mb-6">Thông tin cá nhân</h2>

                <div className="space-y-6 mb-8">
                  <div>
                    <Label htmlFor="name">Họ tên</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Số điện thoại
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-2"
                      placeholder="0123456789"
                    />
                  </div>

                  <div>
                    <Label htmlFor="address" className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Địa chỉ giao hàng
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="mt-2"
                      placeholder="Nhập địa chỉ giao hàng"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleSave}
                    className="flex-1 bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Lưu thay đổi
                  </Button>
                  <Button
                    onClick={() => setIsEditing(false)}
                    variant="outline"
                    className="flex-1 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h2 className="text-xl font-semibold mb-6">Thông tin cá nhân</h2>

                  <div className="space-y-6">
                    <div>
                      <Label className="text-gray-600">Họ tên</Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{formData.name}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-600 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{formData.email}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Số điện thoại
                      </Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{formData.phone || 'Chưa cập nhật'}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-600 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Địa chỉ giao hàng
                      </Label>
                      <div className="flex items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{formData.address || 'Chưa cập nhật'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-6">Tài khoản</h2>

                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-blue-900 font-semibold">Trạng thái: Hoạt động</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <p className="text-gray-600 text-sm mb-2">Tham gia từ</p>
                      <p className="text-gray-900 font-semibold">15 tháng 06 năm 2023</p>
                    </div>

                    <Button variant="outline" className="w-full flex items-center justify-center gap-2 mt-6">
                      <Lock className="w-4 h-4" />
                      Thay đổi mật khẩu
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export interface User {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin";
}