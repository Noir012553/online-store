import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface CloudinarySignatureResponse {
  timestamp: number;
  signature: string;
  api_key: string;
  cloud_name: string;
  folder: string;
  resource_type: string;
  quality: string;
  fetch_format: string;
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
}

type CloudinaryFolder = 'admins' | 'users' | 'reviewers' | 'banners';

export const useCloudinaryUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const getSignature = useCallback(async (folder: CloudinaryFolder = 'users'): Promise<CloudinarySignatureResponse | null> => {
    try {
      const response = await fetch(`/api/cloudinary/signature?folder=${folder}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get signature');
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[CLOUDINARY_SIGNATURE_ERROR]', error);
      }
      toast.error('Failed to get upload signature');
      return null;
    }
  }, []);

  const uploadToCloudinary = useCallback(
    async (file: File, folder: CloudinaryFolder = 'users'): Promise<CloudinaryUploadResult | null> => {
      try {
        setIsUploading(true);
        setUploadProgress(0);

        // Validate file before upload
        if (file.size > 5 * 1024 * 1024) {
          toast.error('File must be smaller than 5MB');
          return null;
        }

        if (!file.type.startsWith('image/')) {
          toast.error('File must be an image');
          return null;
        }

        // Get signature from backend
        const signatureData = await getSignature(folder);
        if (!signatureData) {
          return null;
        }

        // Prepare form data for Cloudinary
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signatureData.api_key);
        formData.append('timestamp', String(signatureData.timestamp));
        formData.append('signature', signatureData.signature);
        formData.append('folder', signatureData.folder);
        formData.append('resource_type', signatureData.resource_type);
        formData.append('quality', signatureData.quality);
        formData.append('fetch_format', signatureData.fetch_format);

        // Upload directly to Cloudinary
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        return new Promise((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                const uploadResult: CloudinaryUploadResult = {
                  public_id: result.public_id,
                  secure_url: result.secure_url,
                  url: result.secure_url,
                  width: result.width,
                  height: result.height,
                  bytes: result.bytes,
                  format: result.format,
                  resource_type: result.resource_type,
                };
                resolve(uploadResult);
              } catch (error) {
                reject(new Error('Invalid response from Cloudinary'));
              }
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });

          xhr.open('POST', `https://api.cloudinary.com/v1_1/${signatureData.cloud_name}/image/upload`);
          xhr.send(formData);
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CLOUDINARY_UPLOAD_ERROR]', error);
        }
        toast.error(error instanceof Error ? error.message : 'Upload failed');
        return null;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [getSignature]
  );

  const validateUploadedImage = useCallback(
    async (uploadResult: CloudinaryUploadResult): Promise<boolean> => {
      try {
        const token = localStorage.getItem('authToken');
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
          }),
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json();
          toast.error(error.message || 'Image validation failed');
          return false;
        }

        return true;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CLOUDINARY_VALIDATE_ERROR]', error);
        }
        toast.error('Failed to validate image');
        return false;
      }
    },
    []
  );

  return {
    isUploading,
    uploadProgress,
    uploadToCloudinary,
    validateUploadedImage,
    getSignature,
  };
};
