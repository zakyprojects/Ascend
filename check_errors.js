const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    } else if (msg.type() === 'warning') {
      console.log('BROWSER WARNING:', msg.text());
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('PAGE UNCAUGHT EXCEPTION:', err.toString());
  });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Page loaded successfully');
  } catch (err) {
    console.log('Failed to load page:', err.message);
  }

  await browser.close();
})();
