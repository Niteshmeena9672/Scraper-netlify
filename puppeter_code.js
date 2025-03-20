const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
require("dotenv").config();

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
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        // console.log(`🔍 Fetching product data from: ${productLink}`);
        await page.goto(productLink, { waitUntil: "domcontentloaded", timeout: 30000 });

        // ✅ Extract product details
        const productData = await page.evaluate(() => {
            const productName = document.querySelector("#productTitle")?.innerText?.trim() || "Not available";
            const price = document.querySelector(".a-price .a-offscreen")?.innerText?.trim() || "Not available";
            return { platform: "Amazon", productName, price };
        });

        // ✅ Programmatically click on #itembox-InstantBankDiscount
        let bankOffers = [];
        const instantBankDiscountElement = await page.$("#itembox-InstantBankDiscount");

        if (instantBankDiscountElement) {
            await instantBankDiscountElement.click();

            // Wait for the bank offer section to appear (shorter timeout)
            try {
                await page.waitForSelector("#InstantBankDiscount p", { timeout: 3000 });
            } catch (error) {}

            // ✅ Extract all bank offers dynamically
            bankOffers = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("#InstantBankDiscount p"))
                    .map(el => el.innerText.trim())
                    .filter(text => text);
            });
        }

        return { ...productData, bankOffers };
    } catch (error) {
        console.error(`❌ Error in extractAmazonData: ${error.message}`);
        return { error: `An error occurred while fetching product data: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};




const fetchAndExtractFlipkartData = async (productUrl) => {
  let browser;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      headless: true, // Run in non-headless mode (visible browser)
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"], // Add --start-maximized
    });

    const page = await browser.newPage();

    // Set a larger viewport
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`Fetching product data from: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // ✅ Extract product details
    const productData = await page.evaluate(() => {
      const title =
        document.querySelector("h1._6EBuvT span.VU-ZEz")?.innerText?.trim() ||
        "Not available";
      const price =
        document.querySelector("div.Nx9bqj.CxhGGd")?.innerText?.trim() ||
        "Not available";
      return { platform: "Flipkart", title, price };
    });

    // ✅ Extract Brand Name
    const titleParts = productData.title.split(" ");
    const brandName = titleParts[0] || "Unknown";
    const productName = productData.title.replace(brandName, "").trim();

    // ✅ Extract Offers (Bank Offers & Discounts) - Handle button presence/absence
    let offers = [];
    try {
      // Check if the "View More Offers" button exists
      const buttonSelector =
        "#container > div > div._39kFie.N3De93.JxFEK3._48O0EI > div.DOjaWF.YJG4Cf > div.DOjaWF.gdgoEp.col-8-12 > div:nth-child(3) > div.f\\+WmCe > div > button";
      const buttonExists = await page.$(buttonSelector);

      if (buttonExists) {
        // Button exists, so click it
        await page.evaluate((selector) => {
          const button = document.querySelector(selector);
          if (button) {
            button.click();
          } else {
            console.error("Button not found with selector:", selector); //This should not happen now
          }
        }, buttonSelector);

        // Wait for offers to potentially load after the click
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.log("View More Offers button does not exist on this page.");
      }

      // Extract offers (whether the button was clicked or not)
      offers = await page.evaluate(() => {
        let extractedOffers = [];
        document.querySelectorAll("li.kF1Ml8.col").forEach((el) => {
          const offerTitle = el.querySelector("span.ynXjOy")?.innerText?.trim();
          const offerDescription = el
            .querySelector("span:not(.ynXjOy)")
            ?.innerText?.trim();
          if (offerTitle && offerDescription) {
            extractedOffers.push(`${offerTitle}: ${offerDescription}`);
          }
        });
        return extractedOffers.length > 0
          ? extractedOffers
          : ["No offers available"];
      });
    } catch (error) {
      console.warn("⚠️ Failed to fetch bank offers:", error.message);
      offers = ["No offers available"]; // Default value on error
    }

    // ✅ Extract **Complete HTML Content**
    const htmlContent = await page.evaluate(() => document.documentElement.outerHTML);

    return {
      ...productData,
      brandName,
      productName,
      offers,
      // htmlContent,
    };
  } catch (error) {
    console.error(`❌ Error in fetchAndExtractFlipkartData: ${error.message}`);
    return {
      error: `An error occurred while fetching product data: ${error.message}`,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};


async function fetchMyntra(url) {
  let driver;
  try {
      if (!url.includes("myntra.com")) {
          return { Error: "Given link does not belong to Myntra" };
      }

      // Set up Chrome options
      const chromeOptions = new chrome.Options()
          .addArguments("--disable-gpu", "--no-sandbox", "--remote-debugging-port=9222")
          .addArguments(`--user-data-dir=/tmp/chrome-profile-${Date.now()}`) // Unique user data dir

      // Initialize the WebDriver
      driver = await new Builder()
          .forBrowser("chrome")
          .setChromeOptions(chromeOptions)
          .build();

      // Load the webpage
      await driver.get(url);

      // Extract product details
      let brand = await driver.findElement(By.className("pdp-title")).getText();
      let product = await driver.findElement(By.className("pdp-name")).getText();
      let price = await driver.findElement(By.className("pdp-price")).getText();

      // Extract offers
      let offers = [];
      try {
          let offerElements = await driver.findElements(By.className("pdp-offers-offerLikeBestPrice"));
          for (let offerElement of offerElements) {
              let fullText = await offerElement.getText();
              try {
                  let termsElement = await offerElement.findElement(By.className("pdp-offers-linkButton"));
                  let termsText = await termsElement.getText();
                  fullText = fullText.replace(termsText, "").trim();
              } catch (error) {
                  // No action needed if 'Terms & Condition' is not found
              }
              offers.push(fullText);
          }
      } catch (error) {
          offers = ["No offers available"];
      }

      return {
          Platform: "Myntra",
          Product: product,
          Brand: brand,
          Price: price,
          Offers: offers,
      };
  } catch (error) {
      return { Error: `An unexpected error occurred: ${error.message}` };
  } finally {
      if (driver) await driver.quit();
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
    else if (url.includes("myntra")){
      productData = await fetchMyntra(url);
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