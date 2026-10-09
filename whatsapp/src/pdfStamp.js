const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const STAMP_HEIGHT = 40;
const FONT_SIZE = 12;
const MARGIN = 12;

// Tamanho de pagina A4 em pontos (72dpi), usado para o layout em grade das imagens.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CELL_GAP = 10;

function buildStampText(sender, timestamp) {
  const date = new Date(timestamp * 1000).toLocaleString('pt-BR');
  return `Recebido via WhatsApp de: ${sender} - ${date}`;
}

function drawStampOnPage(page, font, text) {
  const { width } = page.getSize();
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height: STAMP_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawText(text, {
    x: MARGIN,
    y: MARGIN,
    size: FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawPageNumber(page, font, index, total) {
  const { width } = page.getSize();
  const text = `pagina ${index}/${total}`;
  const textWidth = font.widthOfTextAtSize(text, FONT_SIZE);
  page.drawText(text, {
    x: width - MARGIN - textWidth,
    y: MARGIN,
    size: FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
}

function embedImage(pdfDoc, buffer, mimetype) {
  return mimetype.includes('png') ? pdfDoc.embedPng(buffer) : pdfDoc.embedJpg(buffer);
}

/**
 * Calcula quantas colunas/linhas usar para caber `count` imagens numa mesma
 * pagina, mantendo as celulas o mais quadradas possivel.
 */
function gridDimensions(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

/**
 * Adiciona ao `pdfDoc` uma ou mais paginas com as imagens organizadas em
 * grade (varias por folha, para economizar papel). Todas as imagens do
 * grupo devem pertencer ao mesmo identificador (ver `buildCombinedPdf`).
 * @param {PDFDocument} pdfDoc
 * @param {import('pdf-lib').PDFFont} font
 * @param {Array<{buffer: Buffer, mimetype: string, identifier: string, timestamp: number}>} images
 * @param {number} imagesPerPage
 */
async function addImageGridPages(pdfDoc, font, images, imagesPerPage) {
  const { cols, rows } = gridDimensions(Math.min(imagesPerPage, images.length));
  const chunks = [];
  for (let i = 0; i < images.length; i += imagesPerPage) {
    chunks.push(images.slice(i, i + imagesPerPage));
  }

  const cellWidth = (PAGE_WIDTH - 2 * MARGIN - (cols - 1) * CELL_GAP) / cols;
  const cellHeight = (PAGE_HEIGHT - 2 * MARGIN - STAMP_HEIGHT - (rows - 1) * CELL_GAP) / rows;
  const stampText = buildStampText(images[0].identifier, images[0].timestamp);

  for (const chunk of chunks) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    for (let i = 0; i < chunk.length; i += 1) {
      const { buffer, mimetype } = chunk[i];
      const image = await embedImage(pdfDoc, buffer, mimetype);

      const col = i % cols;
      const row = Math.floor(i / cols);

      const scale = Math.min(cellWidth / image.width, cellHeight / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      const cellX = MARGIN + col * (cellWidth + CELL_GAP);
      const cellTopY = PAGE_HEIGHT - MARGIN - row * (cellHeight + CELL_GAP);

      // centraliza a imagem dentro da celula
      const x = cellX + (cellWidth - drawWidth) / 2;
      const y = cellTopY - cellHeight + (cellHeight - drawHeight) / 2;

      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
    }

    drawStampOnPage(page, font, stampText);
  }
}

/**
 * Anexa ao `pdfDoc` todas as paginas de um PDF ja existente, carimbando o
 * identificador do remetente (numero ou "Nome - Telefone") em cada uma delas.
 * @param {PDFDocument} pdfDoc
 * @param {import('pdf-lib').PDFFont} font
 * @param {Buffer} pdfBuffer
 * @param {string} identifier
 * @param {number} timestamp
 */
async function appendExistingPdfPages(pdfDoc, font, pdfBuffer, identifier, timestamp) {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
  const stampText = buildStampText(identifier, timestamp);

  for (const page of copiedPages) {
    pdfDoc.addPage(page);
    const { width, height } = page.getSize();
    // Aumenta a altura da pagina para nao sobrepor o conteudo original
    page.setSize(width, height + STAMP_HEIGHT);
    page.translateContent(0, STAMP_HEIGHT);
    drawStampOnPage(page, font, stampText);
  }
}

/**
 * Une varias midias acumuladas de um mesmo remetente num unico PDF pronto
 * para impressao: imagens consecutivas com o mesmo identificador viram
 * paginas em grade (economia de papel) e documentos PDF sao anexados na
 * integra logo apos, cada pagina carimbada com o identificador daquele item
 * (numero do remetente, ou "Nome - Telefone" se um rotulo estiver ativo).
 * A ordem de chegada e preservada; uma troca de identificador no meio de uma
 * sequencia de imagens fecha o grupo de grade atual e comeca outro.
 * @param {Array<{type: 'image'|'pdf', buffer: Buffer, mimetype?: string, identifier: string, timestamp: number}>} items
 * @param {number} imagesPerPage
 * @returns {Promise<Buffer>}
 */
async function buildCombinedPdf(items, imagesPerPage) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let pendingImages = [];
  const flushImages = async () => {
    if (pendingImages.length === 0) return;
    await addImageGridPages(pdfDoc, font, pendingImages, imagesPerPage);
    pendingImages = [];
  };

  for (const item of items) {
    if (item.type === 'image') {
      const currentGroupId = pendingImages.length > 0 ? pendingImages[0].identifier : null;
      if (currentGroupId !== null && currentGroupId !== item.identifier) {
        await flushImages();
      }
      pendingImages.push(item);
    } else {
      await flushImages();
      await appendExistingPdfPages(pdfDoc, font, item.buffer, item.identifier, item.timestamp);
    }
  }
  await flushImages();

  const totalPages = pdfDoc.getPageCount();
  pdfDoc.getPages().forEach((page, idx) => drawPageNumber(page, font, idx + 1, totalPages));

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = {
  buildCombinedPdf,
};
