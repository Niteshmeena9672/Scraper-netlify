const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
require("dotenv").config();

// Install the required packages:
// npm install puppeteer-extra puppeteer-extra-plugin-stealth puppeteer

// Use the stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

// Function to extract Amazon data using Puppeteer
const extractAmazonData = async (productLink) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, // Set to true for production
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

const fetchAndExtractFlipkartData = async (productUrl) => {
    let browser;
    try {
      const puppeteer = require("puppeteer");
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
  
      const page = await browser.newPage();
  
    //   await page.setUserAgent(
    //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    //   );
    //   await page.setExtraHTTPHeaders({
    //     "Accept-Language": "en-US,en;q=0.9",
    //   });
  
      console.log(`Fetching product data from: ${productUrl}`);
      await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 60000 });
  
      // Extract product details
      const productData = await page.evaluate(() => {
        const title = document.querySelector("h1._6EBuvT span.VU-ZEz")?.innerText?.trim() || "Not available";
        const price = document.querySelector("div.Nx9bqj.CxhGGd")?.innerText?.trim() || "Not available";
        return { platform: "Flipkart", title, price };
      });
  
      // Extract Brand Name
      const titleParts = productData.title.split(" ");
      const brandName = titleParts[0] || "Unknown";
      const productName = productData.title.replace(brandName, "").trim();
  
      // **Extract Offers (Bank Offers & Discounts)**
      let offers = [];
      try {
        await page.waitForSelector("li.kF1Ml8.col", { timeout: 10000 });
  
        offers = await page.evaluate(() => {
          let extractedOffers = [];
          document.querySelectorAll("li.kF1Ml8.col").forEach((el) => {
            const offerTitle = el.querySelector("span.ynXjOy")?.innerText?.trim(); // "Bank Offer"
            const offerDescription = el.querySelector("span:not(.ynXjOy)")?.innerText?.trim(); // "5% Unlimited Cashback..."
            if (offerTitle && offerDescription) {
              extractedOffers.push(`${offerTitle}: ${offerDescription}`);
            }
          });
          return extractedOffers.length > 0 ? extractedOffers : ["No offers available"];
        });
      } catch (error) {
        console.warn("⚠️ Failed to fetch bank offers:", error.message);
      }
  
      // **Extract Complete HTML for Debugging**
      const htmlContent = await page.evaluate(() => document.documentElement.outerHTML);
  
      return {
        ...productData,
        brandName,
        productName,
        offers,
        
      };
    } catch (error) {
      console.error(`❌ Error in fetchAndExtractFlipkartData: ${error.message}`);
      return { error: `An error occurred while fetching product data: ${error.message}` };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  };
  

async function fetchMyntra(url) {
    if (!url.includes("myntra.com")) {
        return { Error: "Given link does not belong to Myntra" };
    }

    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle2" });

        // Extract product details
        const brand = await page.$eval(".pdp-title", el => el.innerText);
        const product = await page.$eval(".pdp-name", el => el.innerText);
        const price = await page.$eval(".pdp-price", el => el.innerText);

        // Extract offers
        const offerElements = await page.$$(".pdp-offers-offerLikeBestPrice");
        const offers = await Promise.all(
            offerElements.map(async (offer) => {
                return await offer.evaluate(el => el.innerText);
            })
        );

        return {
            Platform: "Myntra",
            Product: product,
            Brand: brand,
            Price: price,
            Offers: offers.length ? offers : ["No offers available"]
        };
    } catch (error) {
        return { Error: `An unexpected error occurred: ${error.message}` };
    } finally {
        if (browser) await browser.close();
    }
}
/**
 * Express route to scrape product details
 */
app.get("/scrape", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  try {
    let productData;
    if (url.includes("amazon")) {
      productData = await extractAmazonData(url);
    }
    else if (url.includes("flipkart")){
        productData = await fetchAndExtractFlipkartData(url);
    }
     else {
      // Default logic for unknown websites
      productData = {
        error: "Unsupported website. Only Amazon is supported in this example.",
      };
    }
    res.json(productData);
  } catch (error) {
    res.status(500).json({ error: `Failed to scrape data: ${error.message}` });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Web Scraper API!",
    usage: "Use the '/scrape' endpoint with a 'url' query parameter to extract product data.",
    example: "/scrape?url=https://www.amazon.in/dp/B08N5WRWNW",
    supportedSites: ["Amazon"],
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});