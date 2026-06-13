import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  RefreshCw,
  AlertTriangle 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface TranslationStatus {
  code: string;
  layer1: {
    name: string;
    progress: number;
    totalNamespaces: number;
    completedNamespaces: number;
  };
  layer2: {
    name: string;
    progress: number;
    expectedTranslations: number;
    actualTranslations: number;
  };
  errors: {
    failed_rate_limit: number;
    failed_error: number;
    pending_retry: number;
  };
  totalErrors: number;
}

interface FailedTranslation {
  _id: string;
  hashKey: string;
  originalText: string;
  translatedText: string;
  targetLang: string;
  entityType: string;
  status: 'failed_rate_limit' | 'failed_error' | 'pending_retry';
  retryCount: number;
  lastRetryAt?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function TranslationDashboardPage() {
  const [selectedLang, setSelectedLang] = useState('pt');
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [failedItems, setFailedItems] = useState<FailedTranslation[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [editingItem, setEditingItem] = useState<FailedTranslation | null>(null);
  const [editingText, setEditingText] = useState('');

  // Fetch translation status
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/translations/admin/status/${selectedLang}`,
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data.data);
    } catch (error) {
      toast.error('Lỗi tải dữ liệu dịch');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch failed translations
  const fetchFailedItems = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/translations/admin/failed/${selectedLang}?limit=50`,
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );
      if (!res.ok) throw new Error('Failed to fetch failed items');
      const data = await res.json();
      setFailedItems(data.data.items);
    } catch (error) {
      toast.error('Lỗi tải danh sách lỗi');
      console.error(error);
    }
  };

  // Retry failed translations
  const handleRetryFailed = async () => {
    if (!window.confirm('Bắt đầu retry các translations bị lỗi? Quá trình này sẽ chạy ở background.')) {
      return;
    }

    setRetrying(true);
    try {
      const res = await fetch(`${API_BASE}/translations/admin/retry/${selectedLang}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({})
      });

      if (!res.ok) throw new Error('Failed to retry translations');
      const data = await res.json();
      toast.success(`Đã đánh dấu ${data.data.resetCount} items để retry`);

      // Refresh status after a delay
      setTimeout(() => {
        fetchStatus();
        fetchFailedItems();
      }, 2000);
    } catch (error) {
      toast.error('Lỗi retry translations');
      console.error(error);
    } finally {
      setRetrying(false);
    }
  };

  // Manual edit translation
  const handleManualEdit = async () => {
    if (!editingItem) return;

    try {
      const res = await fetch(`${API_BASE}/translations/admin/edit-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          hashKey: editingItem.hashKey,
          translatedText: editingText
        })
      });

      if (!res.ok) throw new Error('Failed to update translation');

      toast.success('Cập nhật bản dịch thành công');
      setEditingItem(null);
      setEditingText('');
      fetchFailedItems();
    } catch (error) {
      toast.error('Lỗi cập nhật bản dịch');
      console.error(error);
    }
  };

  // Load initial data
  useEffect(() => {
    fetchStatus();
    fetchFailedItems();
  }, [selectedLang]);

  return (
    <div className="w-full space-y-6 p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">📊 Bảng điều khiển dịch</h1>
            <p className="text-gray-600 mt-2">Quản lý tiến độ dịch multilingual cho hệ thống</p>
          </div>
          <Button onClick={fetchStatus} disabled={loading} variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Làm mới
          </Button>
        </div>

        {/* Language Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chọn ngôn ngữ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {['pt', 'fr', 'de', 'es', 'it', 'ja'].map((lang) => (
                <Button
                  key={lang}
                  onClick={() => setSelectedLang(lang)}
                  variant={selectedLang === lang ? 'default' : 'outline'}
                >
                  {lang.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {status ? (
          <>
            {/* Layer 1: UI Strings */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>🎯 Layer 1: UI Strings (Giao diện - Tĩnh)</span>
                  {status.layer1.progress === 100 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                </CardTitle>
                <CardDescription>
                  Các chuỗi giao diện tĩnh (menu, button, label...)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">Tiến độ</span>
                    <span className="text-sm font-mono bg-white px-2 py-1 rounded">
                      {status.layer1.progress}% ({status.layer1.completedNamespaces}/{status.layer1.totalNamespaces})
                    </span>
                  </div>
                  <Progress value={status.layer1.progress} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Tổng namespaces</p>
                    <p className="text-2xl font-bold">{status.layer1.totalNamespaces}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Hoàn thành</p>
                    <p className="text-2xl font-bold text-green-600">{status.layer1.completedNamespaces}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Layer 2: Products */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>📦 Layer 2: Sản phẩm (Động)</span>
                  {status.layer2.progress > 80 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  )}
                </CardTitle>
                <CardDescription>
                  Tên, mô tả, spec, feature của sản phẩm (chấp nhận fallback & rate limit)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">Tiến độ</span>
                    <span className="text-sm font-mono bg-white px-2 py-1 rounded">
                      {status.layer2.progress}% ({status.layer2.actualTranslations}/{status.layer2.expectedTranslations})
                    </span>
                  </div>
                  <Progress value={status.layer2.progress} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Dự kiến</p>
                    <p className="text-2xl font-bold">{status.layer2.expectedTranslations}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Thực tế</p>
                    <p className="text-2xl font-bold text-green-600">{status.layer2.actualTranslations}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Error Summary */}
            {status.totalErrors > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    ⚠️ Lỗi ({status.totalErrors})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Rate Limit (429)</p>
                      <p className="text-2xl font-bold text-red-600">{status.errors.failed_rate_limit}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Lỗi khác</p>
                      <p className="text-2xl font-bold text-orange-600">{status.errors.failed_error}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Chờ retry</p>
                      <p className="text-2xl font-bold text-yellow-600">{status.errors.pending_retry}</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleRetryFailed}
                    disabled={retrying}
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    {retrying ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        🔄 Dịch lại các sản phẩm lỗi
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Failed Items Table */}
            {failedItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">📋 Danh sách lỗi ({failedItems.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Loại</th>
                          <th className="text-left py-2 px-2">Text gốc</th>
                          <th className="text-left py-2 px-2">Trạng thái</th>
                          <th className="text-left py-2 px-2">Retry</th>
                          <th className="text-left py-2 px-2">Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failedItems.map((item) => (
                          <tr key={item._id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2">
                              <Badge variant="outline">{item.entityType}</Badge>
                            </td>
                            <td className="py-2 px-2 max-w-xs truncate">
                              {item.originalText}
                            </td>
                            <td className="py-2 px-2">
                              <Badge
                                variant={
                                  item.status === 'failed_rate_limit'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {item.status === 'failed_rate_limit' ? '429' : 'Error'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-xs">
                              {item.retryCount}/3
                            </td>
                            <td className="py-2 px-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingItem(item);
                                      setEditingText(item.translatedText);
                                    }}
                                  >
                                    ✏️ Sửa
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Sửa bản dịch</DialogTitle>
                                    <DialogDescription>
                                      {item.entityType} - {item.originalText.substring(0, 50)}...
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <label className="text-sm font-semibold">Text gốc</label>
                                      <Input value={item.originalText} disabled />
                                    </div>
                                    <div>
                                      <label className="text-sm font-semibold">Bản dịch</label>
                                      <Textarea
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        rows={4}
                                      />
                                    </div>
                                    <Button onClick={handleManualEdit} className="w-full">
                                      💾 Lưu bản dịch
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
