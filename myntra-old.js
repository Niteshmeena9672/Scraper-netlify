const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = 3003;

// Define a list of User-Agent headers for making requests look more human-like.
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
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-A505F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/567.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    },
];

/**
 * Function to fetch HTML content from a given URL with retries and header rotation.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The HTML content as a string.
 * @throws {Error} - If fetching HTML fails after multiple retries.
 */
async function fetchHTML(url) {
    const randomHeader = headersList[Math.floor(Math.random() * headersList.length)];
    console.log('Selected header:', randomHeader);

    try {
        console.log('Fetching HTML...');
        const response = await axios.get(url, { headers: randomHeader });
        console.log('HTML fetched successfully.');
        return response.data;
    } catch (error) {
        console.error('Error fetching HTML:', error);
        throw new Error('Failed to fetch HTML content.');
    }
}

/**
 * Function to extract Product JSON-LD script from HTML.
 * @param {string} html - The HTML content to parse.
 * @returns {string|null} - The sanitized JSON-LD script string or null if not found.
 * @throws {Error} - If there's an error parsing JSON-LD (after sanitization).
 */
function extractProductJSONLD(html) {
    const $ = cheerio.load(html);
    let jsonLdScript = null;

    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            let jsonString = $(el).html();
            // Sanitize the JSON string to remove bad control characters
            const sanitizedJsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            const data = JSON.parse(sanitizedJsonString);

            if (data['@type'] === 'Product') {
                jsonLdScript = sanitizedJsonString;
                return false; // Exit the loop when product script is found
            }
        } catch (error) {
            console.error('Error parsing JSON-LD:', error);
            // Continue to next script tag if parsing fails for the current one.
        }
    });
    return jsonLdScript;
}

/**
 * Function to extract product data from parsed JSON-LD object.
 * @param {object} jsonData - The parsed JSON-LD data.
 * @returns {object} - The extracted product data.
 */
function extractProductData(jsonData) {
    if (!jsonData || jsonData['@type'] !== 'Product') {
        throw new Error('Invalid Product JSON-LD data provided.');
    }

    try {
        const productData = {
            platform: 'Myntra',
            brandName: jsonData.brand?.name, // Use optional chaining to avoid errors if brand or name is missing
            productName: jsonData.name,
            price: jsonData.offers?.price,     // Use optional chaining for offers and price
            // ratingCount: jsonData.AggregateRating?.ratingCount, // Optional chaining for AggregateRating and ratingCount
            // ratingValue: jsonData.AggregateRating?.ratingValue, // Optional chaining for AggregateRating and ratingValue
        };
        return productData;
    } catch (error) {
        console.error('Error extracting product data:', error);
        throw new Error('Failed to extract product details from JSON-LD.');
    }
}


app.get('/myntra-scrape', async (req, res) => {
    const url = req.query.url;

    console.log(`Received request for URL: ${url}`);

    if (!url) {
        console.log('URL parameter is missing.');
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const html = await fetchHTML(url);
        const jsonLdScript = extractProductJSONLD(html);

        if (!jsonLdScript) {
            console.log('Product JSON-LD script not found.');
            return res.status(404).json({ error: 'Product JSON-LD script not found' }); // Use 404 for not found
        }

        const jsonData = JSON.parse(jsonLdScript); // Parsing already done in extractProductJSONLD, but needed for type safety and further use.
        const productData = extractProductData(jsonData);

        console.log('Product data:', productData);
        res.json(productData);
        console.log('Response sent.');

    } catch (error) {
        console.error('Scraping process failed:', error);
        res.status(500).json({ error: error.message || 'An error occurred while scraping the data.' }); // Send specific error message
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});