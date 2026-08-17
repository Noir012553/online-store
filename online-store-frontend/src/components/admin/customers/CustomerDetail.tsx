import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, AlertCircle, MapPin, Mail, Phone, Building2 } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { customerAPI } from '../../../lib/api';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { useCurrencyContext } from '../../../lib/context/CurrencyContext';
import { Button } from '../../ui/button';
import { toast } from 'sonner';

interface Customer {
  _id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  totalOrders?: number;
  totalSpent?: number;
  formattedTotalSpent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CustomerDetailProps {
  customerId: string;
}

export function CustomerDetail({ customerId }: CustomerDetailProps) {
  const router = useRouter();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { currencyCode } = useCurrencyContext();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setIsLoading(true);
        const foundCustomer = await customerAPI.getCustomerById(customerId, currencyCode);

        if (foundCustomer) {
          setCustomer(foundCustomer);
        } else {
          toast.error(t('error_customer_not_found', 'admin'));
          router.push('/admin/customers');
        }
      } catch (error) {
        toast.error(t('error_load_data', 'common'));
        router.push('/admin/customers');
      } finally {
        setIsLoading(false);
      }
    };

    if (customerId) {
      fetchCustomer();
    }
  }, [customerId, currencyCode, locale, t, router]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-2xl py-4 sm:py-6">
        <div className="bg-white rounded-lg border p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{t('error_customer_not_found', 'admin')}</p>
          <Button onClick={() => router.push('/admin/customers')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('back', 'common')}
          </Button>
        </div>
      </div>
    );
  }

  const firstName = customer.firstName || customer.name?.split(' ')[0] || '';
  const lastName = customer.lastName || customer.name?.split(' ')[1] || '';
  const fullName = `${firstName} ${lastName}`.trim();

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin/customers')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('back', 'common')}
        </Button>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{fullName || t('not_updated', 'admin')}</h1>
            <p className="text-gray-600">{customer.email || t('not_updated', 'admin')}</p>
          </div>
          <Button
            asChild
            className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
          >
            <Link href={`/admin/customers/${customerId}/edit`}>
              {t('edit', 'common')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="space-y-4 rounded-lg border bg-white p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            {t('contact_information', 'admin')}
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-600 mb-1">{t('email_label', 'admin')}</p>
              <p className="text-sm font-medium">
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {customer.email}
                  </a>
                ) : (
                  t('not_updated', 'admin')
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">{t('phone_placeholder', 'admin')}</p>
              <p className="text-sm font-medium">
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {customer.phone}
                  </a>
                ) : (
                  t('not_updated', 'admin')
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">{t('shipping_address', 'admin')}</p>
              <p className="text-sm font-medium flex items-start gap-2">
                <Building2 className="w-4 h-4 mt-1 flex-shrink-0" />
                <span>{customer.address || t('not_updated', 'admin')}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Customer Stats */}
        <div className="space-y-4 rounded-lg border bg-white p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700">
            {t('order_info', 'admin')}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t('total_orders', 'admin')}</span>
              <span className="text-lg font-bold text-blue-600">{customer.totalOrders || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t('total_spent', 'admin')}</span>
              <span className="text-lg font-bold text-green-600">
                {customer.formattedTotalSpent ?? customer.totalSpent ?? 0}
              </span>
            </div>
            {customer.createdAt && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t('joined_date', 'admin')}</span>
                <span className="text-sm font-medium">
                  {formatDate(new Date(customer.createdAt), locale)}
                </span>
              </div>
            )}
            {customer.updatedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t('last_updated', 'admin')}</span>
                <span className="text-sm font-medium">
                  {formatDate(new Date(customer.updatedAt), locale)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
