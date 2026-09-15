import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../lib/context/LanguageContext';
import { getAuthToken } from '../lib/api';

export type R2AssetReference = Record<string, unknown> & {
  sourceUrl: string | null;
  storageProvider: 'r2';
  storageAccount: string;
  bucket: string;
  storageKey: string;
  publicUrl: string;
  publicId: string;
  contentHash: string;
  mimeType: string;
  bytes: number;
};

export interface R2UploadResult {
  storageKey: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
  asset: R2AssetReference;
}

type R2Folder = 'admins' | 'users' | 'reviewers' | 'banners';

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

        return await new Promise<R2UploadResult>((resolve, reject) => {
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
                reject(new Error(response.message || 'Upload failed'));
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
              reject(new Error('Invalid response from R2'));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Upload failed')));
          xhr.open('POST', '/api/assets/upload');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(formData);
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[R2_UPLOAD_ERROR]', error);
        }
        toast.error(t('upload_failed', 'common'));
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
