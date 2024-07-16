import { readAsArrayBuffer } from './asyncReader';
import { normalize } from './helpers';
import { getAsset } from './prepareAssets';

export async function save(
  pdfFile: File,
  objects: Attachments[],
  name: string
) {
  try {
    const PDFLib = await getAsset('PDFLib');
    const download = await getAsset('download');

    const pdfDoc = await PDFLib.PDFDocument.load(
      await readAsArrayBuffer(pdfFile)
    );

    const pagesProcesses = pdfDoc
      .getPages()
      .map(async (page: any, pageIndex: any) => {
        const pageObjects = objects[pageIndex];
        const pageHeight = page.getHeight();

        const embedProcesses = pageObjects.map(async (object: Attachment) => {
          if (object.type === 'image') {
            const { file, x, y, width, height } = object as ImageAttachment;
            let img: any;
            try {
              if (file.type === 'image/jpeg') {
                img = await pdfDoc.embedJpg(await readAsArrayBuffer(file));
              } else {
                img = await pdfDoc.embedPng(await readAsArrayBuffer(file));
              }
              return () =>
                page.drawImage(img, {
                  x,
                  y: pageHeight - y - height,
                  width,
                  height,
                });
            } catch (e) {
              console.log('Failed to embed image.', e);
              throw e;
            }
          } else if (object.type === 'text') {
            const {
              x,
              y,
              text,
              lineHeight,
              size,
              fontFamily,
              width,
            } = object as TextAttachment;
            const pdfFont = await pdfDoc.embedFont(fontFamily);
            return () =>
              page.drawText(text, {
                maxWidth: width,
                font: pdfFont,
                size,
                lineHeight,
                x,
                y: pageHeight - size! - y,
              });
          } else if (object.type === 'drawing') {
            const {
              x,
              y,
              path,
              scale,
              stroke,
              strokeWidth,
            } = object as DrawingAttachment;
            const {
              pushGraphicsState,
              setLineCap,
              popGraphicsState,
              setLineJoin,
              LineCapStyle,
              LineJoinStyle,
              rgb,
            } = PDFLib;
            return () => {
              page.pushOperators(
                pushGraphicsState(),
                setLineCap(LineCapStyle.Round),
                setLineJoin(LineJoinStyle.Round)
              );

              const color = window.w3color(stroke!).toRgb();

              page.drawSvgPath(path, {
                borderColor: rgb(
                  normalize(color.r),
                  normalize(color.g),
                  normalize(color.b)
                ),
                borderWidth: strokeWidth,
                scale,
                x,
                y: pageHeight - y,
              });
              page.pushOperators(popGraphicsState());
            };
          }
        });

        const drawProcesses = await Promise.all(embedProcesses);
        drawProcesses.forEach((p) => p && p());
      });

    await Promise.all(pagesProcesses);

    const pdfBytes = await pdfDoc.save();
    download(pdfBytes, name, 'application/pdf');
  } catch (e) {
    console.log('Error while processing PDF:', e);
    throw e;
  }
}
