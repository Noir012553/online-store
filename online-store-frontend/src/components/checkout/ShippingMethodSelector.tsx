import { useEffect, useState } from "react";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { shippingAPI } from "../../lib/api";
import { formatCurrency } from "../../lib/utils";
import { Check } from "lucide-react";

interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  freeThreshold: number | null;
  carrier: string;
  logo: string;
  estimatedDays: string;
  icon: string;
}

interface ShippingMethodSelectorProps {
  selectedMethod: string;
  onMethodChange: (value: string) => void;
  totalPrice: number;
}

export function ShippingMethodSelector({
  selectedMethod,
  onMethodChange,
  totalPrice,
}: ShippingMethodSelectorProps) {
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchShippingMethods = async () => {
      setIsLoading(true);
      try {
        const data = await shippingAPI.getShippingMethods();
        setShippingMethods(Array.isArray(data) ? data : data?.data || []);
      } catch (error) {
        console.error("Failed to fetch shipping methods:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShippingMethods();
  }, []);

  const getShippingPrice = (method: ShippingMethod) => {
    if (method.freeThreshold && totalPrice >= method.freeThreshold) {
      return 0;
    }
    return method.basePrice;
  };

  if (isLoading) {
    return <div className="text-center py-4">Đang tải phương thức vận chuyển...</div>;
  }

  return (
    <RadioGroup value={selectedMethod} onValueChange={onMethodChange}>
      <div className="space-y-3">
        {shippingMethods.map((method) => {
          const price = getShippingPrice(method);
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
                  <RadioGroupItem value={method.id} id={method.id} className="sr-only" />
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
                  <Label htmlFor={method.id} className="cursor-pointer block">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {method.logo && (
                          <div className="flex-shrink-0 bg-white rounded border border-gray-100 p-1.5">
                            <img
                              src={method.logo}
                              alt={method.carrier}
                              className="h-8 w-auto object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{method.name}</p>
                          <p className="text-sm text-gray-500 truncate">{method.carrier}</p>
                        </div>
                      </div>
                      <span
                        className={`text-lg font-bold whitespace-nowrap ml-2 ${
                          price === 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {price === 0 ? "Miễn phí" : formatCurrency(price)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm text-gray-600">{method.description}</p>
                      <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                        {method.estimatedDays}
                      </span>
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
