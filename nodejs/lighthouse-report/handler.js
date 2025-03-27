import lighthouse from 'lighthouse';
import { chromium } from "@playwright/test"
import lighthouseDesktopConfig from "lighthouse/core/config/desktop-config.js"
import fs from 'fs';

// Log Level
// Possible values: silent, error, warn, info, verbose
const LOG_LEVEL = process.env.LOG_LEVEL || "error";
// Maximum allowed connections in the connection pool
const BROWSER_PORT = parseInt(process.env.BROWSER_PORT) || 9000;
// Save reports to disk
const SAVE_REPORTS_TO_DISK = process.env.SAVE_REPORTS_TO_DISK === 'true';
// Default timeout for Lighthouse
const DEFAULT_TIMEOUT_IN_SECONDS = parseInt(process.env.DEFAULT_TIMEOUT_IN_SECONDS) || 60;
// Evaluation Categories
const CATEGORIES = [
  "accessibility",
  "best-practices",
  "performance",
  "pwa",
  "seo",
]
// Device Types
const DEVICE_TYPES = {
  DESKTOP: "desktop",
  MOBILE: "mobile",
}
/**
 * Validates the request body for required fields and structure.
 * @param {Object} body - Request body containing the required fields.
 * @throws {Error} If validation fails.
 */
const validateRequestBody = ({ url, timeout, categories, device }) => {
  const errors = [];

  // Ensure the query string is provided
  if (!url) {
    errors.push('URL is required.');
  }

  // Ensure the timeout is a positive integer
  if (timeout && (isNaN(timeout) || timeout <= 0)) {
    errors.push('Timeout must be a positive integer.');
  }

  // Ensure the categories selected is from the allowed values
  if (categories && categories.length > 0) {
    for (const category of categories) {
      if (!CATEGORIES.includes(category)) {
        errors.push(`Category ${category} is not valid.`);
      }
    }
  }

  // Ensure the device is from the allowed values
  if (device && !Object.values(DEVICE_TYPES).includes(device)) {
    errors.push(`Device ${device} is not valid.`);
  }

  // Throw error if any validation fails
  if (errors.length) {
    var msg = `Validation errors: ${errors.join(' ')}`
    console.log(msg)
    throw new Error(msg);
  }
};

async function runLighthouse({ url, timeout = DEFAULT_TIMEOUT_IN_SECONDS, device = DEVICE_TYPES.DESKTOP, categories = CATEGORIES }) {
  let browser;
  let page;
  try {
    browser = await chromium.launch({
      args: [`--remote-debugging-port=${BROWSER_PORT}`],
    });

    const options = {
      logLevel: LOG_LEVEL,
      output: 'html',
      port: BROWSER_PORT,
      ignoreStatusCode: false,
      maxWaitForLoad: timeout * 1000,
      ...(device === DEVICE_TYPES.DESKTOP ? lighthouseDesktopConfig.settings : {}),
      emulatedUserAgent: `Boltic Serverless v1.0 with mode ${device}`,
      onlyCategories: categories,
    };

    console.log("Running Lighthouse with options:", JSON.stringify(options))

    const runnerResult = await lighthouse(url, options);
    const reportHtml = runnerResult.report;

    // Extract performance metrics from the lighthouse results
    const metrics = {
      firstContentfulPaint: runnerResult.lhr.audits['first-contentful-paint'].numericValue,
      largestContentfulPaint: runnerResult.lhr.audits['largest-contentful-paint'].numericValue,
      speedIndex: runnerResult.lhr.audits['speed-index'].numericValue,
      totalBlockingTime: runnerResult.lhr.audits['total-blocking-time'].numericValue,
      cumulativeLayoutShift: runnerResult.lhr.audits['cumulative-layout-shift'].numericValue,
      // Convert milliseconds to seconds for better readability
      timeToInteractive: runnerResult.lhr.audits['interactive'].numericValue,
      performanceScore: runnerResult.lhr.categories.performance.score * 100
    };

    // Generate PDF directly without saving HTML first
    page = await browser.newPage();
    await page.setContent(reportHtml, {
      waitUntil: 'load',
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10px',
        right: '10px',
        bottom: '10px',
        left: '10px'
      }
    });

    if (SAVE_REPORTS_TO_DISK) {
      fs.writeFileSync('lighthouse-report.html', reportHtml);
      fs.writeFileSync('lighthouse-report.pdf', pdfBuffer);
    }

    // Check report size
    const reportSizeInMB = Buffer.byteLength(reportHtml) / (1024 * 1024);
    if (reportSizeInMB > 4) {
      console.warn(`Warning: Report size (${reportSizeInMB.toFixed(2)} MB) exceeds 4MB`);
      // throw new Error(`Report size (${reportSizeInMB.toFixed(2)} MB) exceeds 4MB`) // Uncomment if needed
    } else {
      console.log(`Report size: ${reportSizeInMB.toFixed(2)} MB`);
    }

    return {
      reports: {
        // Uncomment if needed
        // html: reportHtml.toString('base64'),
        pdf: pdfBuffer.toString('base64'),
      },
      metrics: {
        firstContentfulPaint: Number((metrics.firstContentfulPaint / 1000).toFixed(2)),
        largestContentfulPaint: Number((metrics.largestContentfulPaint / 1000).toFixed(2)),
        speedIndex: Number((metrics.speedIndex / 1000).toFixed(2)),
        totalBlockingTime: Number(metrics.totalBlockingTime.toFixed(2)),
        cumulativeLayoutShift: Number(metrics.cumulativeLayoutShift.toFixed(3)),
        timeToInteractive: Number((metrics.timeToInteractive / 1000).toFixed(2)),
        performanceScore: Number(metrics.performanceScore.toFixed(0)),
      }
    };

  } catch (error) {
    console.error('Error generating lighthouse report:', error);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * Express.js handler for incoming requests.
 * Run Lighthouse and return the result.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const handler = async (req, res) => {
  try {
    console.log('Received request:', JSON.stringify(req.body));
    // Ensure the request method is POST
    if (req.method !== 'POST') {
      return res.status(400).json({ error: 'Invalid method, only POST allowed.' });
    }

    // Extract and validate request body
    validateRequestBody(req.body);

    // Initialize startTime
    const startTime = new Date();

    // Run Lighthouse
    const result = await runLighthouse(req.body);
    // Calculate elapsed time in seconds
    const elapsedTime = (new Date() - startTime) / 1000;

    // Log the elapsed time
    console.log(`Lighthouse execution time: ${elapsedTime.toFixed(3)} seconds`);

    // Send the result
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      ...result,
      executionTime: Number(elapsedTime.toFixed(3))
    });
  } catch (error) {
    console.error('Error handling request:', error.message);
    res.status(500).json({ error: error.message });
  }
};
