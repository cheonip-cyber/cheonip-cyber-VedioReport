import * as pdfjsLib from 'pdfjs-dist';

// Fix for potential default export wrapper from esm.sh
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

if (pdfjs.GlobalWorkerOptions) {
  // Use cdnjs for better stability and avoiding some cross-origin worker issues found with esm.sh
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export const extractImagesFromPdf = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const images: string[] = [];
    const ops = pdfjs.OPS;

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const operatorList = await page.getOperatorList();
        const fnArray = operatorList.fnArray;
        const argsArray = operatorList.argsArray;

        // Iterate through operators to find images
        for (let j = 0; j < fnArray.length; j++) {
          if (fnArray[j] === ops.paintImageXObject) {
            const imgName = argsArray[j][0];
            
            try {
              // Access the image object from the page's object collection
              // Note: usage of page.objs.get depends on the pdf.js version, wrapping in promise to be safe
              const img: any = await new Promise((resolve) => {
                 page.objs.get(imgName, (data: any) => {
                    resolve(data);
                 });
              });

              if (img && img.width > 50 && img.height > 50) { // Lower threshold slightly
                 const canvas = document.createElement('canvas');
                 canvas.width = img.width;
                 canvas.height = img.height;
                 const ctx = canvas.getContext('2d');
                 
                 if (ctx) {
                    // 흰 배경을 먼저 채움 (bitmap 경로의 투명 처리용)
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Handle ImageBitmap (browser supported)
                    if (img.bitmap) {
                        // drawImage는 Canvas 합성 모드를 따르므로
                        // 위에서 채운 흰 배경 위에 자연스럽게 합성됨
                        ctx.drawImage(img.bitmap, 0, 0);
                        images.push(canvas.toDataURL('image/jpeg'));
                    } 
                    // Handle raw data (RGBA/RGB)
                    else if (img.data) {
                         let imageData: ImageData | null = null;
                         const len = img.data.length;

                         if (len === img.width * img.height * 4) {
                             // RGBA → 알파 블렌딩으로 흰 배경과 합성
                             // 문서 뷰어가 투명 이미지를 흰 배경 위에 합성하는 것과 동일한 처리.
                             // JPEG은 투명도를 지원하지 않아 투명 픽셀이 검정으로 변환되는
                             // 문제를 방지하기 위해 알파값 기반으로 흰색과 블렌딩.
                             // 공식: 최종값 = 원본값 × (alpha/255) + 255 × (1 - alpha/255)
                             const rgba = new Uint8ClampedArray(img.width * img.height * 4);
                             for (let k = 0; k < len; k += 4) {
                                 const alpha = img.data[k + 3] / 255;
                                 rgba[k]     = Math.round(img.data[k]     * alpha + 255 * (1 - alpha)); // R
                                 rgba[k + 1] = Math.round(img.data[k + 1] * alpha + 255 * (1 - alpha)); // G
                                 rgba[k + 2] = Math.round(img.data[k + 2] * alpha + 255 * (1 - alpha)); // B
                                 rgba[k + 3] = 255; // Alpha 완전 불투명으로 고정
                             }
                             imageData = new ImageData(rgba, img.width, img.height);
                         } else if (len === img.width * img.height * 3) {
                             // RGB → 투명도 없으므로 알파 블렌딩 불필요, RGBA로 변환만
                             const rgba = new Uint8ClampedArray(img.width * img.height * 4);
                             let p = 0;
                             for (let k = 0; k < len; k += 3) {
                                 rgba[p++] = img.data[k];
                                 rgba[p++] = img.data[k + 1];
                                 rgba[p++] = img.data[k + 2];
                                 rgba[p++] = 255;
                             }
                             imageData = new ImageData(rgba, img.width, img.height);
                         } else if (len === img.width * img.height) {
                             // Grayscale → 투명도 없으므로 알파 블렌딩 불필요, RGBA로 변환만
                             const rgba = new Uint8ClampedArray(img.width * img.height * 4);
                             let p = 0;
                             for (let k = 0; k < len; k++) {
                                 const val = img.data[k];
                                 rgba[p++] = val;
                                 rgba[p++] = val;
                                 rgba[p++] = val;
                                 rgba[p++] = 255;
                             }
                             imageData = new ImageData(rgba, img.width, img.height);
                         }

                         if (imageData) {
                             ctx.putImageData(imageData, 0, 0);
                             images.push(canvas.toDataURL('image/jpeg'));
                         }
                    }
                 }
              }
            } catch (imgError) {
              console.warn(`Error extracting image ${imgName} on page ${i}:`, imgError);
            }
          }
        }
        
        // Clean up page resources
        page.cleanup();
      } catch (pageError) {
        console.warn(`Error processing page ${i}:`, pageError);
      }
    }
    
    console.log(`Extracted ${images.length} images from PDF`);
    return images;
  } catch (error) {
    console.error("PDF Image Extraction failed:", error);
    return [];
  }
};