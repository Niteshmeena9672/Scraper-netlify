const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

// Use your local CORS Anywhere proxy
const PROXY_URL = "http://localhost:8080/";

/**
 * Function to extract Amazon product data using Puppeteer
 */
const extractAmazonData = async (productLink) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            defaultViewport: null,
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        const proxiedUrl = PROXY_URL + productLink;
        await page.goto(proxiedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Extract product details
        const productData = await page.evaluate(() => {
            const productName = document.querySelector("#productTitle")?.innerText?.trim() || "Not available";
            const price = document.querySelector(".a-price .a-offscreen")?.innerText?.trim() || "Not available";
            return { platform: "Amazon", productName, price };
        });

        return productData;
    } catch (error) {
        console.error(`❌ Error in extractAmazonData: ${error.message}`);
        return { error: `An error occurred while fetching product data: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Express route to scrape product details
 */
app.get("/scrape", async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    try {
        const productData = await extractAmazonData(url);
        res.json(productData);
    } catch (error) {
        res.status(500).json({ error: `Failed to scrape data: ${error.message}` });
    }
});

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to the Web Scraper API!",
        usage: "Use '/scrape' with a 'url' query parameter to extract product data.",
        example: "/scrape?url=https://www.amazon.in/dp/B08N5WRWNW",
        supportedSites: ["Amazon"],
    });
});

/**
 * Start the Express server
 */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
