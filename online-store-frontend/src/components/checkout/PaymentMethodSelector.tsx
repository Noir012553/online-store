import { useEffect, useState } from "react";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { paymentAPI } from "../../lib/api";
import { Check } from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  shortName: string;
  provider: string;
  logo: string;
  icon: string;
  badge: string;
  fee: number;
  processingTime: string;
  supported: boolean;
  details: string;
}

interface PaymentMethodSelectorProps {
  selectedMethod: string;
  onMethodChange: (value: string) => void;
}

export function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
}: PaymentMethodSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      setIsLoading(true);
      try {
        const data = await paymentAPI.getPaymentMethods();
        setPaymentMethods(Array.isArray(data) ? data : data?.data || []);
      } catch (error) {
        console.error("Failed to fetch payment methods:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPaymentMethods();
  }, []);

  if (isLoading) {
    return <div className="text-center py-4">Đang tải phương thức thanh toán...</div>;
  }

  return (
    <RadioGroup value={selectedMethod} onValueChange={onMethodChange}>
      <div className="space-y-3">
        {paymentMethods.map((method) => {
          const isSelected = selectedMethod === method.id;

          return (
            <div
              key={method.id}
              className={`relative border-2 rounded-lg p-4 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-green-500 bg-gradient-to-r from-green-50 to-transparent shadow-md"
                  : "border-gray-200 hover:border-green-300 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="relative pt-1">
                  <RadioGroupItem value={method.id} id={`payment-${method.id}`} className="sr-only" />
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                      isSelected
                        ? "border-green-500 bg-green-500 shadow-lg"
                        : "border-gray-300 bg-white hover:border-green-400"
                    }`}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white font-bold" strokeWidth={3} />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <Label htmlFor={`payment-${method.id}`} className="cursor-pointer block">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {method.logo && (
                          <div className="flex-shrink-0 bg-white rounded border border-gray-100 p-1.5">
                            <img
                              src={method.logo}
                              alt={method.provider}
                              className="h-8 w-auto object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-semibold text-gray-900 truncate">{method.name}</p>
                            <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                              {method.badge}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">{method.provider}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm text-gray-600">{method.description}</p>
                      <div className="text-right text-xs flex-shrink-0">
                        <div className="text-gray-500 mb-0.5">
                          Xử lý: <span className="font-medium text-gray-700">{method.processingTime}</span>
                        </div>
                        {method.fee === 0 && (
                          <span className="text-green-600 font-medium block">Không có phí</span>
                        )}
                      </div>
                    </div>
                  </Label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </RadioGroup>
  );
}
