/**
 * บีบอัดรูปภาพเป็น Base64 Data URL ที่มีขนาดกะทัดรัด (WebP หรือ JPEG)
 * เพื่อให้บันทึกและแสดงผลได้ทันทีโดยไม่ต้องพึ่งพา Storage Bucket
 */
export async function compressImageToDataUrl(file, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // แปลงเป็น WebP ถ้า browser รองรับ หรือ fallback เป็น JPEG
        try {
          const dataUrl = canvas.toDataURL('image/webp', quality)
          resolve(dataUrl)
        } catch {
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
