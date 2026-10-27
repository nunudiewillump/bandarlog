import sharp from 'sharp';
export async function normalizePhoto(value: string | null) {
  if (!value) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 220000)
    throw new Error('La foto debe ser PNG, JPEG o WebP y ocupar menos de 160 KB.');
  try {
    const image = await sharp(Buffer.from(value.split(',')[1], 'base64'), {
      limitInputPixels: 4000000,
    })
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
    return 'data:image/webp;base64,' + image.toString('base64');
  } catch {
    throw new Error('No se pudo leer la foto. Elige otra imagen.');
  }
}
