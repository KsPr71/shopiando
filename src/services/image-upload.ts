import * as ImageManipulator from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';

export type OptimizedImage = {
  uri: string;
  contentType: 'image/webp';
  extension: 'webp';
};

export async function optimizeImageForUpload(image: ImagePicker.ImagePickerAsset): Promise<OptimizedImage> {
  const maxDimension = 1280;
  const resize = image.width >= image.height
    ? { width: Math.min(image.width, maxDimension) }
    : { height: Math.min(image.height, maxDimension) };
  const result = await ImageManipulator.manipulateAsync(
    image.uri,
    [{ resize }],
    { compress: 0.68, format: ImageManipulator.SaveFormat.WEBP },
  );
  return { uri: result.uri, contentType: 'image/webp', extension: 'webp' };
}
