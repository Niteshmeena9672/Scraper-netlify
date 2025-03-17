const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");

require("dotenv").config();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;


const extractAmazonData = async (productLink) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false, // Set to true for production
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            defaultViewport: null,
        });

        const page = await browser.newPage();

        // Set a random user-agent
        const userAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
        await page.setUserAgent(userAgent);

        console.log(`🔍 Fetching product data from: ${productLink}`);
        await page.goto(productLink, { waitUntil: "networkidle2", timeout: 60000 });

        // ✅ Extract product details
        const productData = await page.evaluate(() => {
            const title = document.querySelector("#productTitle")?.innerText?.trim() || "Not available";
            const price = document.querySelector(".a-price .a-offscreen")?.innerText?.trim() || "Not available";
            const asinMatch = window.location.href.match(/\/dp\/(B[A-Z0-9]{9})/);
            const asin = asinMatch ? asinMatch[1] : null;
            return { platform: "Amazon", title, price, asin };
        });

        // ✅ Extract parameters dynamically from `data-side-sheet`
        const extractedParams = await page.evaluate(() => {
            const sideSheetElement = document.querySelector("[data-action='side-sheet']");
            if (!sideSheetElement) return {};

            const sideSheetData = sideSheetElement.getAttribute("data-side-sheet");
            if (!sideSheetData) return {};

            try {
                const parsedData = JSON.parse(sideSheetData.replace(/&quot;/g, '"'));
                return {
                    smid: parsedData.smid || "",
                    buyingOptionIndex: parsedData.buyingOptionIndex || "0",
                    encryptedMerchantId: parsedData.encryptedMerchantId || "",
                    sr: parsedData.sr || "",
                };
            } catch (error) {
                console.warn("⚠️ Failed to parse data-side-sheet JSON:", error);
                return {};
            }
        });

        console.log("✅ Extracted Parameters:", extractedParams);

        // ✅ Function to fetch bank offers using `axios`
        const fetchBankOffers = async (featureParams) => {
            try {
                const offerType = featureParams.includes("GCCashback") ? "GCCashback" : "InstantBankDiscount";
                const baseRedirectedUrl = "https://www.amazon.in/gp/product/ajax";
                const params = new URLSearchParams({
                    asin: productData.asin,
                    deviceType: "web",
                    offerType, // Dynamically set offerType based on featureParams
                    buyingOptionIndex: extractedParams.buyingOptionIndex || "0",
                    additionalParams: `merchantId:${extractedParams.encryptedMerchantId}`,
                    smid: extractedParams.smid || "",
                    encryptedMerchantId: extractedParams.encryptedMerchantId || "",
                    sr: extractedParams.sr || "",
                    experienceId: "vsxOffersSecondaryView",
                    showFeatures: "vsxoffers",
                    featureParams, // This changes on retry
                });

                const redirectedLink = `${baseRedirectedUrl}?${params.toString()}`;
                console.log(`🔍 Fetching bank offers from: ${redirectedLink}`);

                // Perform an HTTP GET request using axios
                const response = await axios.get(redirectedLink, {
                    headers: {
                        "User-Agent": userAgent,
                        Accept: "text/html",
                    },
                });

                if (response.status !== 200) {
                    throw new Error("Failed to fetch bank offers");
                }

                // Extract bank offers from response data (HTML parsing)
                const html = response.data;
                const offers = [];
                const regex = /<p[^>]*>(.*?)<\/p>/g;
                let match;
                while ((match = regex.exec(html)) !== null) {
                    offers.push(match[1].trim());
                }

                // return { offers, bankOffersHtml: html };
                 return { offers };

            } catch (error) {
                console.warn("⚠️ Failed to fetch bank offers:", error.message);
                return { offers: [], bankOffersHtml: "<div>Error fetching bank offers</div>" };
            }
        };

        // ✅ First attempt with `InstantBankDiscount`
        let { offers, bankOffersHtml } = await fetchBankOffers("OfferType:InstantBankDiscount,DeviceType:web");

        // 🔄 Retry with `GCCashback` if no offers were found
        if (offers.length === 0 || offers.includes("No bank offers available")) {
            console.log("🔄 Retrying with GCCashback...");
            ({ offers, bankOffersHtml } = await fetchBankOffers("OfferType:GCCashback,DeviceType:web"));
        }

        // ✅ Extract Brand Name (first word of the title)
        const brandName = productData.title.split(" ")[0];
        const productName = productData.title.replace(brandName, "").trim();

        return {
            ...productData,
            brandName,
            productName,
            offers,
            bankOffersHtml,
            extractedParams, // ✅ Added dynamically extracted parameters
        };
    } catch (error) {
        console.error(`❌ Error in extractAmazonData: ${error.message}`);
        return { error: `An error occurred while fetching product data: ${error.message}` };
    } finally {
        if (browser) await browser.close();
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
