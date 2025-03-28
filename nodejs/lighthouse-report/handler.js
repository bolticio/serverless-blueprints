// Import the required modules
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import lighthouseDesktopConfig from "lighthouse/core/config/desktop-config.js"
import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';

// Define the port to listen on
const PORT = process.env.BOLT_APPLICATION_PORT || 8080;
const DEV_MODE = process.env.BOLT_DEVELOPMENT_MODE || false;
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
// Declare global browser instance
let GLOBAL_BROWSER = null;

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

/**
 * Validates the request body for required fields and structure.
 * @param {Object} body - Request body containing the required fields.
 * @throws {Error} If validation fails.
 */
const validateRequestBody = ({ url, timeout, categories, device }) => {
  const errors = [];

  // Ensure the query string is provided and is a valid URL
  if (!url) {
    errors.push('URL is required.');
  } else {
    const urlPattern = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i;
    if (!urlPattern.test(url)) {
      errors.push(`URL ${url} is not valid.`);
    }
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
  let context;
  let page;
  try {
    // Launch browser only if it's not already running
    if (!GLOBAL_BROWSER) {
      GLOBAL_BROWSER = await chromium.launch({
        args: [`--remote-debugging-port=${BROWSER_PORT}`],
      });
      console.log('Launched new browser instance.');
    } else {
      console.log('Reusing existing browser instance.');
    }

    // Set up Lighthouse options
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
      firstContentfulPaint: runnerResult.lhr.audits['first-contentful-paint'].numericValue ?? 0,
      largestContentfulPaint: runnerResult.lhr.audits['largest-contentful-paint'].numericValue ?? 0,
      speedIndex: runnerResult.lhr.audits['speed-index'].numericValue ?? 0,
      totalBlockingTime: runnerResult.lhr.audits['total-blocking-time'].numericValue ?? 0,
      cumulativeLayoutShift: runnerResult.lhr.audits['cumulative-layout-shift'].numericValue ?? 0,
      timeToInteractive: runnerResult.lhr.audits['interactive'].numericValue ?? 0,
      performanceScore: (runnerResult.lhr.categories.performance?.score ?? 0) * 100
    };

    // Create a new incognito browser context
    context = await GLOBAL_BROWSER.newContext();
    page = await context.newPage()
    // Generate PDF directly without saving HTML first
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
    if (context) await context.close();
    // Don't close the browser here – keep it running globally
  }
}

// Initialize the express application
const app = express();
// Disable x-powered-by header
app.disable('x-powered-by');
// parse application/json
app.use(bodyParser.json())
// Use the request handler function for all routes
app.all('*', handler);

// Start the server and listen on the defined port
app.listen(PORT, () => {
  if (DEV_MODE) {
    console.log(
      `Listening for events on port ${PORT} in development mode`
    );
  } else {
    console.log(
      `Listening for events`
    );
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (GLOBAL_BROWSER) {
    await GLOBAL_BROWSER.close();
    console.log('Browser closed.');
  }
  process.exit();
});
