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
                    // Handle ImageBitmap (browser supported)
                    if (img.bitmap) {
                        ctx.drawImage(img.bitmap, 0, 0);
                        images.push(canvas.toDataURL('image/jpeg'));
                    } 
                    // Handle raw data (RGBA/RGB)
                    else if (img.data) {
                         let imageData: ImageData | null = null;
                         const len = img.data.length;

                         if (len === img.width * img.height * 4) {
                             // RGBA
                             imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
                         } else if (len === img.width * img.height * 3) {
                             // RGB -> Convert to RGBA
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
                             // Grayscale -> Convert to RGBA
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