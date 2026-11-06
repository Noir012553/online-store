import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../lib/context/LanguageContext';
import { getAuthToken, refreshAccessToken, type R2AssetReference } from '../lib/api';

export interface R2UploadResult {
  storageKey: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
  asset: R2AssetReference;
}

type R2Folder = 'admins' | 'users' | 'reviewers' | 'banners' | 'brands';

export const useR2Upload = () => {
  const { t } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadToR2 = useCallback(
    async (file: File, folder: R2Folder = 'users'): Promise<R2UploadResult | null> => {
      try {
        setIsUploading(true);
        setUploadProgress(0);

        if (file.size > 5 * 1024 * 1024) {
          toast.error(t('upload_file_too_large', 'common'));
          return null;
        }
        if (!file.type.startsWith('image/')) {
          toast.error(t('upload_file_must_be_image', 'common'));
          return null;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);
        const token = getAuthToken();

        const sendUpload = (accessToken: string | null) => new Promise<R2UploadResult>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', event => {
            if (event.lengthComputable) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          });
          xhr.addEventListener('load', () => {
            try {
              const response = JSON.parse(xhr.responseText);
              if (xhr.status < 200 || xhr.status >= 300 || !response.asset) {
                const responseCode = typeof response.code === 'string'
                  ? response.code
                  : xhr.status < 200 || xhr.status >= 300
                    ? `HTTP_${xhr.status}`
                    : 'INVALID_UPLOAD_RESPONSE';
                const failureCode = responseCode === 'REQUEST_FAILED'
                  ? `${responseCode}_HTTP_${xhr.status}`
                  : responseCode;
                reject(Object.assign(new Error(response.message || 'Upload failed'), {
                  failureCode,
                  httpStatus: xhr.status,
                }));
                return;
              }
              const asset = response.asset as R2AssetReference;
              resolve({
                storageKey: asset.storageKey,
                publicUrl: asset.publicUrl,
                bytes: asset.bytes,
                mimeType: asset.mimeType,
                asset,
              });
            } catch {
              reject(Object.assign(new Error('Invalid response from R2'), {
                failureCode: `HTTP_${xhr.status}`,
                httpStatus: xhr.status,
              }));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Upload failed')));
          xhr.addEventListener('timeout', () => reject(Object.assign(new Error('Upload timed out'), { failureCode: 'R2_UPLOAD_TIMEOUT' })));
          xhr.timeout = 60000;
          xhr.open('POST', '/api/assets/upload');
          if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          xhr.send(formData);
        });

        try {
          return await sendUpload(token);
        } catch (error) {
          const isUnauthorized = error && typeof error === 'object'
            && 'httpStatus' in error && error.httpStatus === 401;
          if (!isUnauthorized || await refreshAccessToken() !== true) throw error;
          return await sendUpload(getAuthToken());
        }
      } catch (error) {
        const failureCode = error && typeof error === 'object' && 'failureCode' in error
          && typeof error.failureCode === 'string'
          ? error.failureCode
          : null;
        toast.dismiss('auth-login-success');
        toast.error(
          failureCode ? `${t('upload_failed', 'common')} (${failureCode})` : t('upload_failed', 'common'),
          { id: 'r2-upload-failure' },
        );
        return null;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [t],
  );

  const validateUploadedAsset = useCallback((uploadResult: R2UploadResult | null): boolean => (
    Boolean(uploadResult?.asset?.storageProvider === 'r2' && uploadResult.asset.storageKey)
  ), []);

  return {
    isUploading,
    uploadProgress,
    uploadToR2,
    validateUploadedAsset,
  };
};
