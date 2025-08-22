import puppeteer from 'puppeteer';

/**
 * Generate a high-fidelity PDF buffer from a full HTML string using Puppeteer.
 * Ensures background colors/images are printed and CSS is honored.
 * @param {string} html - Full HTML string (include <html>, <head> with <style> or CSS links, and <body>)
 * @param {object} options - Puppeteer page.pdf options override
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generatePDFBufferFromHTML(html, options = {}) {
  let browser;
  try {
    browser = await puppeteer.launch({
      // Allow headless in server environments; default new headless is ok
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    const page = await browser.newPage();
    // Set a larger default viewport to avoid layout shifts
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Load the full HTML
    await page.setContent(html, {
      waitUntil: ['networkidle0'],
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true, // critical for colors/backgrounds
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      ...options,
    });

    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
