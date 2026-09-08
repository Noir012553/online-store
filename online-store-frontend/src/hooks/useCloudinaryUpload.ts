import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../lib/context/LanguageContext';
import { getAuthToken } from '../lib/api';

interface CloudinarySignatureResponse {
  timestamp: number;
  signature: string;
  api_key: string;
  cloud_name: string;
  public_id: string;
  allowed_formats: string;
  overwrite: boolean;
  resource_type: string;
  cloudinaryAccountId: string;
  claimId: string;
}

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  resource_type: string;
  cloudinaryAccountId?: string;
  claimId?: string;
}

const isCloudinaryRateLimit = (status: number, message: string) => (
  [420, 429].includes(status)
  || /(rate limit|too many requests|quota exceeded|resource limit)/i.test(message)
);

type CloudinaryFolder = 'admins' | 'users' | 'reviewers' | 'banners';

export const useCloudinaryUpload = () => {
  const { t } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const getSignature = useCallback(async (
    folder: CloudinaryFolder = 'users',
    excludedAccountIds: string[] = [],
  ): Promise<CloudinarySignatureResponse | null> => {
    try {
      const token = getAuthToken();
      const query = new URLSearchParams({ folder });
      if (excludedAccountIds.length > 0) {
        query.set('excludeAccountIds', excludedAccountIds.join(','));
      }
      const response = await fetch(`/api/cloudinary/signature?${query.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get signature');
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[CLOUDINARY_SIGNATURE_ERROR]', error);
      }
      toast.error(t('upload_signature_error', 'common'));
      return null;
    }
  }, [t]);

  const uploadToCloudinary = useCallback(
    async (file: File, folder: CloudinaryFolder = 'users'): Promise<CloudinaryUploadResult | null> => {
      try {
        setIsUploading(true);
        setUploadProgress(0);

        // Validate file before upload
        if (file.size > 5 * 1024 * 1024) {
          toast.error(t('upload_file_too_large', 'common'));
          return null;
        }

        if (!file.type.startsWith('image/')) {
          toast.error(t('upload_file_must_be_image', 'common'));
          return null;
        }

        const attemptedAccountIds: string[] = [];
        while (true) {
          const signatureData = await getSignature(folder, attemptedAccountIds);
          if (!signatureData) return null;
          attemptedAccountIds.push(signatureData.cloudinaryAccountId);

          const formData = new FormData();
          formData.append('file', file);
          formData.append('api_key', signatureData.api_key);
          formData.append('timestamp', String(signatureData.timestamp));
          formData.append('signature', signatureData.signature);
          formData.append('public_id', signatureData.public_id);
          formData.append('allowed_formats', signatureData.allowed_formats);
          formData.append('overwrite', String(signatureData.overwrite));

          try {
            return await new Promise<CloudinaryUploadResult>((resolve, reject) => {
              const xhr = new XMLHttpRequest();

              xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                  const percentComplete = Math.round((e.loaded / e.total) * 100);
                  setUploadProgress(percentComplete);
                }
              });

              xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    const result = JSON.parse(xhr.responseText);
                    resolve({
                      public_id: result.public_id,
                      secure_url: result.secure_url,
                      url: result.secure_url,
                      width: result.width,
                      height: result.height,
                      bytes: result.bytes,
                      format: result.format,
                      resource_type: result.resource_type,
                      cloudinaryAccountId: signatureData.cloudinaryAccountId,
                      claimId: signatureData.claimId,
                    });
                  } catch {
                    reject(new Error('Invalid response from Cloudinary'));
                  }
                  return;
                }

                let message = `Upload failed: ${xhr.statusText}`;
                try {
                  const errorResponse = JSON.parse(xhr.responseText);
                  message = errorResponse.error?.message || errorResponse.error?.http_code || message;
                } catch {
                  message = `Upload failed: ${xhr.statusText}`;
                }
                const error = new Error(message) as Error & { status?: number; cloudinaryAccountId?: string };
                error.status = xhr.status;
                error.cloudinaryAccountId = signatureData.cloudinaryAccountId;
                reject(error);
              });

              xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
              });

              xhr.open('POST', `https://api.cloudinary.com/v1_1/${signatureData.cloud_name}/image/upload`);
              xhr.send(formData);
            });
          } catch (error) {
            const uploadError = error as Error & { status?: number; cloudinaryAccountId?: string };
            if (!isCloudinaryRateLimit(uploadError.status || 0, uploadError.message)
              || attemptedAccountIds.length >= 100) {
              throw error;
            }
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CLOUDINARY_UPLOAD_ERROR]', error);
        }
        toast.error(t('upload_failed', 'common'));
        return null;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [getSignature, t]
  );

  const validateUploadedImage = useCallback(
    async (uploadResult: CloudinaryUploadResult): Promise<boolean> => {
      try {
        const token = getAuthToken();
        const response = await fetch('/api/cloudinary/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            publicId: uploadResult.public_id,
            url: uploadResult.secure_url,
            width: uploadResult.width,
            height: uploadResult.height,
            bytes: uploadResult.bytes,
            type: uploadResult.format,
            cloudinaryAccountId: uploadResult.cloudinaryAccountId,
            claimId: uploadResult.claimId,
          }),
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json();
          toast.error(t('image_validation_failed', 'common'));
          return false;
        }

        return true;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CLOUDINARY_VALIDATE_ERROR]', error);
        }
        toast.error(t('image_validation_request_failed', 'common'));
        return false;
      }
    },
    [t]
  );

  return {
    isUploading,
    uploadProgress,
    uploadToCloudinary,
    validateUploadedImage,
    getSignature,
  };
};
