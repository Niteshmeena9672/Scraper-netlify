const express = require("express");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const app = express();
const PORT = 3001;

async function fetchMyntra(url) {
    let driver;
    try {
        if (!url.includes("myntra.com")) {
            return { Error: "Given link does not belong to Myntra" };
        }

        // Set up Chrome options
        const chromeOptions = new chrome.Options()
            .addArguments("--disable-gpu", "--no-sandbox");

        // Initialize the WebDriver
        driver = await new Builder()
            .forBrowser("chrome")
            .setChromeOptions(chromeOptions)
            .build();

        // Load the webpage
        await driver.get(url);
        await driver.sleep(3000);

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

app.get("/scrape", async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ Error: "URL parameter is required" });
    }
    const result = await fetchMyntra(url);
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
