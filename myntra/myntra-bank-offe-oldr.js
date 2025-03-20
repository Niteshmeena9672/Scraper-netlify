const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = 3000; // Server running on port 3000

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

/**
 * Extract JSON from the script content
 */
const extractJSON = (scriptContent) => {
    try {
        console.log("Extracted Script Content (Raw):\n", scriptContent); // Debugging

        // Match JSON inside pageStateData
        const jsonMatch = scriptContent.match(/pageStateData\s*=\s*(\{[\s\S]*?\});/);
        if (!jsonMatch || !jsonMatch[1]) {
            console.error('Error: Could not extract valid JSON structure from script.');
            return null;
        }

        // Clean and parse JSON
        const cleanedScript = jsonMatch[1].replace(/;$/, '').trim(); // Remove trailing semicolon if present
        console.log("Cleaned JSON String:\n", cleanedScript); // Debugging

        return JSON.parse(cleanedScript);
    } catch (error) {
        console.error('Error parsing JSON from script:', error);
        return null;
    }
};

app.get('/myntra-scrape', async (req, res) => {
    const url = req.query.url;
    console.log(`Received request for URL: ${url}`);

    if (!url) {
        console.log('URL parameter is missing.');
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    let scriptContent = null;
    let attempts = 0;
    const maxAttempts = headersList.length;
    let currentHeaderIndex = 0;

    while (attempts < maxAttempts && !scriptContent) {
        const currentHeader = headersList[currentHeaderIndex];
        console.log(`Attempt ${attempts + 1} using header:`, currentHeader['User-Agent']);

        try {
            console.log('Fetching HTML...');
            const response = await axios.get(url, { headers: currentHeader });
            console.log('HTML fetched successfully.');

            const html = response.data;
            const $ = cheerio.load(html);

            console.log('Parsing HTML...');
            $('script').each((i, el) => {
                const scriptText = $(el).html();
                if (scriptText && scriptText.includes('pageStateData')) {
                    scriptContent = scriptText;
                    return false; // Exit loop once found
                }
            });

            if (scriptContent) {
                console.log('Script tag containing pageStateData found.');
                break;
            } else {
                console.log('Script tag containing pageStateData not found. Retrying...');
            }
        } catch (error) {
            console.error('Error during attempt with header:', currentHeader['User-Agent'], error);
            console.log('Retrying with next header.');
        }

        attempts++;
        currentHeaderIndex = (currentHeaderIndex + 1) % headersList.length; // Rotate headers
    }

    if (!scriptContent) {
        return res.status(500).json({ error: 'Failed to extract script content after multiple attempts' });
    }

    const pageStateData = extractJSON(scriptContent);
    if (!pageStateData) {
        return res.status(500).json({
            error: 'Error parsing pageStateData JSON',
            rawScript: scriptContent, // Return raw content for debugging
        });
    }

    // Extract bank offers
    let bankOffers = [];
    try {
        const offerDataSets = pageStateData.data?.pageLevelComponents?.footers; // Adjust path as needed

        if (offerDataSets) {
            offerDataSets.forEach(footer => {
                const buttons = footer.itemData?.data?.buttonStates;
                if (buttons) {
                    for (const key in buttons) {
                        const buttonGroup = buttons[key]?.buttons;
                        if (Array.isArray(buttonGroup)) {
                            buttonGroup.forEach(button => {
                                const onClickSuccess = button.states?.addToBag?.onClickSuccess;
                                if (onClickSuccess && onClickSuccess.tracking && onClickSuccess.tracking.dataOverride) {
                                    const offerDetails = onClickSuccess.tracking.dataOverride?.widget_items?.data_set?.data;
                                    if (offerDetails && offerDetails.length > 0 && offerDetails[0].entity_optional_attributes) {
                                        const offerAttr = offerDetails[0].entity_optional_attributes;
                                        if (offerAttr.title && offerAttr.description) {
                                            bankOffers.push({
                                                title: offerAttr.title,
                                                description: offerAttr.description
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error extracting bank offers:', error);
        return res.status(500).json({ error: 'Error extracting bank offers' });
    }

    res.json({ bankOffers });
    console.log('Bank offers extracted successfully:', bankOffers);
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
