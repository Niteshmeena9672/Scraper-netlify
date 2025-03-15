const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();

const app = express();
const PORT = 3000;

/**
 * Function to fetch a webpage with retries
 */
const fetchWithRetry = async (url, headers, retries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, { headers });
      if (response.status === 200) {
        return response.data;
      }
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Failed after ${retries} attempts: ${error.message}`);
      }
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};
// List of user-agents to rotate
const headersList = [
  {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
  },
  {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
  },
  {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-A505F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
  },
];


const extractAmazonData = async (productLink) => {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    };

    // Fetch the product page HTML with retries
    const productHtml = await fetchWithRetry(productLink, headers);
    const $ = cheerio.load(productHtml);

    const platform = "Amazon";
    const title = $("#productTitle").text().trim() || "Not available";
    const price =
      $(".a-price .a-offscreen").first().text().trim() || "Not available";

    // Extract ASIN from the product link
    const asinMatch = productLink.match(/\/dp\/([^/]+)\//);
    if (!asinMatch) {
      return { error: "Invalid product link. ASIN not found." };
    }

    const asin = asinMatch[1];

    // Fetch Bank Offers
    let offers = [];
    try {
      const baseRedirectedUrl = "https://www.amazon.in/gp/product/ajax";
      const params = new URLSearchParams({
        asin: asin,
        deviceType: "web",
        offerType: "InstantBankDiscount",
        buyingOptionIndex: "0",
        additionalParams: "merchantId:AXOGFIT0PZZ7G",
        smid: "",
        sr: "T4QPPAFH5NGYDNQ6RYF6",
        experienceId: "vsxOffersSecondaryView",
        showFeatures: "vsxoffers",
        featureParams: "OfferType:InstantBankDiscount,DeviceType:web",
      });

      const redirectedLink = `${baseRedirectedUrl}?${params.toString()}`;
      const bankHtml = await fetchWithRetry(redirectedLink, headers);
      const bank$ = cheerio.load(bankHtml);
      const paragraphs = bank$("p.a-spacing-mini.a-size-base-plus, p.a-size-medium-plus.a-spacing-medium.a-spacing-top-small");

      paragraphs.each((i, el) => {
        offers.push(bank$(el).text().trim());
      });

      if (offers.length === 0) {
        offers = ["No bank offers available"];
      }
    } catch (error) {
      console.warn("Failed to fetch bank offers:", error.message);
    }

    // Extract Brand Name (Assuming first word of title is the brand)
    const brandName = title.split(" ")[0];

    // Extract Product Name (Rest of the title)
    const productName = title.replace(brandName, "").trim();

    return {
      platform,
      brandName,
      productName,
      price,
      offers,
    };
  } catch (error) {
    return { error: `An error occurred while fetching product data: ${error.message}` };
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
      let productData;
      if (url.includes("ajio")) {
        productData = await extractAjioData(url);
      } else if (url.includes("nykaa")) {
        productData = await extractNykaaData(url);
      } else if (url.includes("vijaysales")) {
        productData = await extractVijaySalesData(url);
      } else if (url.includes("amazon")) {
        productData = await extractAmazonData(url);
      } else if (url.includes("croma")) {
        productData = await fetchCromaProductData(url);
      } else if (url.includes("tatacliq")) {
        productData = await extractTataCliq(url);
      } else if (url.includes("reliancedigital")) {
        productData = await fetchProductDataReliancedigital(url);
      } else if (url.includes("flipkart")) {
        productData = await fetchAndExtractFlipkartData(url);
      } else {
        // Default logic for unknown websites
        const html = await fetchWithRetry(url, {});
        const $ = cheerio.load(html);
        productData = {
          metaDescription: $('meta[name="description"]').attr("content") || "Not available",
          ogDescription: $('meta[property="og:description"]').attr("content") || "Not available",
          twitterDescription: $('meta[name="twitter:description"]').attr("content") || "Not available",
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
        example: "/scrape?url=https://www.example.com",
        supportedSites: ["Ajio", "Nykaa", "VijaySales", "Amazon", "Croma", "TataCliq", "RelianceDigital", "Flipkart"]
    });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
