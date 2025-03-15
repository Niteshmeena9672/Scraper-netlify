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


/**
 * Function to scrape Flipkart product details (Flipkartcode)
*/
const fetchAndExtractFlipkartData = async (productUrl) => {
  let attempt = 0;

  while (attempt < headersList.length) {
      try {
          // Set headers for the current attempt
          const headers = headersList[attempt];

          // Fetch HTML data directly from Flipkart
          const response = await axios.get(productUrl, {
              headers: headers,
              timeout: 10000, // Adjust timeout as needed
          });

          if (response.status !== 200) {
              throw new Error(`Failed to fetch HTML. Status Code: ${response.status}`);
          }

          const html = response.data;
          const $ = cheerio.load(html);

          // Extract product details
          const platform = "Flipkart";

          // Extract product title
          const fullTitle = $("h1._6EBuvT span.VU-ZEz").text().trim() || "Not available";

          // Extract brand name and product name
          const titleParts = fullTitle.split(" ");
          const brandName = titleParts[0] || "Unknown"; // First word assumed as brand
          const productName = fullTitle.replace(brandName, "").trim(); // Remove brand from title

          // Extract price
          const price = $("div.Nx9bqj.CxhGGd").text().trim() || "Not available";

          // Extract offer details
          const offers = [];
          $(".+-2B3d.row").each((index, element) => {
              offers.push($(element).text().trim());
          });

          return {
              platform,
              brandName,
              productName,
              price,
              offers: offers.length > 0 ? offers : ["No offers available"],
          };
      } catch (error) {
          console.error(`Attempt ${attempt + 1} failed:`, error.message);
          attempt++;
          if (attempt >= headersList.length) {
              throw new Error("All attempts failed to fetch Flipkart data");
          }
      }
  }
};


/**
 * Function to scrape Reliance product details (Reliancecode)
*/
async function fetchProductDataReliancedigital(productLink) {
  if (!productLink.includes("reliancedigital")) {
    return { Platform: "" };
  }
  try {
    const headers = {
      Cookie:
        "akacd_reliance-digital-new=2147483647~rv=5~id=506f0adef6ac00068fb77034af91e5d0;",
    };

    // Fetch product page
    const response = await axios.get(productLink, { headers });
    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);

    let articleId = "";
    let price = "Not available";
    let brand = "Not available";
    let productName = "Not available";
    let productUrl = "";
    let offers = [];

    // Extract JSON data from `window.__INITIAL_STATE__`
    const scriptTag = $('script:contains("window.__INITIAL_STATE__")').html();
    if (scriptTag) {
      const match = scriptTag.match(
        /window\.__INITIAL_STATE__\s*=\s*(\{.*\});/
      );
      if (match) {
        try {
          const jsonData = JSON.parse(match[1]);
          articleId = jsonData?.productDetailsPage?.product?.item_code || "";
        } catch (error) {
          console.error("Failed to parse JSON:", error);
        }
      }
    }

    // Extract product details from structured JSON-LD
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const jsonData = JSON.parse($(script).html());
        if (jsonData["@type"] === "Product") {
          price = jsonData?.offers?.price || "Not available";
          brand = jsonData?.brand || "Not available";
          productName = jsonData?.name || "Not available";
          productUrl = jsonData?.url || "";
        }
      } catch (error) {
        console.error("Error parsing JSON-LD:", error);
      }
    });

    // Fetch bank offers
    if (articleId && productUrl) {
      const productDetail = productUrl.split("/").pop();
      const offerApiUrl = `https://www.reliancedigital.in/ext/raven-api/promotions?article-id=${articleId}&slug=${productDetail}`;
      // console.log("offerApi: ", offerApiUrl);

      try {
        const offerResponse = await axios.get(offerApiUrl, { headers });

        // Extract bank offers
        offers = offerResponse.data?.data?.bank_offers?.map(
          (offer) => offer.offer_desc
        ) || [];

        // Extract EMI data and include only required details (Bank Name, Card Name, Offer Amount)
        const emiData = offerResponse.data?.data?.emi_data;
        if (emiData) {
          for (const [cardName, emiDetails] of Object.entries(emiData)) {
            emiDetails
              .filter((emi) => emi.emi_type === "FULL_SWIPE") // Only include FULL_SWIPE EMI types
              .forEach((emi) => {
                offers.push(
                  `₹${emi.offer_amount} discount with ${emi.bank_name} ${emi.card_name}`
                );
              });
          }
        }
        // console.log("offers: ", offers);

        // Return the extracted data in the desired format
        return {
          platform: "Reliance Digital",
          brandName: brand,
          productName: productName,
          price: price,
          offers: offers.length > 0 ? offers : ["No offers available"],
        };
      } catch (error) {
        console.error("Failed to fetch offers:", error);
      }
    }
  } catch (error) {
    console.error("Error fetching Reliance Digital data:", error);
  }

  return { Platform: "Reliance Digital", error: "Failed to fetch data" };
}

/**
 * Function to scrape Croma product details (Cromacode)
*/
async function fetchCromaProductData(productUrl) {
  try {
      let html = null;
      let headersIndex = 0;

      // Try fetching HTML with different headers
      while (headersIndex < headersList.length && !html) {
          try {
              const response = await axios.get(productUrl, {
                  headers: headersList[headersIndex],
                  timeout: 100000,
              });

              if (response.status === 200) {
                  html = response.data;
                  console.log(`Successfully fetched HTML using header index: ${headersIndex}`);
              } else {
                  console.warn(`Failed to fetch HTML with header index ${headersIndex}. Status Code: ${response.status}`);
              }
          } catch (error) {
              console.warn(`Error fetching HTML with header index ${headersIndex}:`, error.message);
          } finally {
              headersIndex++;
          }
      }

      if (!html) {
          throw new Error("All headers failed to fetch HTML");
      }

      // Load HTML into Cheerio
      const $ = cheerio.load(html);

      // Extract only the first JSON-LD script as a string
      const firstJsonLdScript = $('script[type="application/ld+json"]').first().html()?.trim();

      let productDetails = {};

      if (firstJsonLdScript) {


          // Clean up JSON string (remove newlines, extra spaces)
          const cleanedJson = firstJsonLdScript.replace(/\s+/g, " ").trim();

          // Extract data using regex (instead of JSON.parse)
          const productNameMatch = cleanedJson.match(/"name"\s*:\s*"([^"]+)"/);
          const priceMatch = cleanedJson.match(/"price"\s*:\s*"([^"]+)"/);
          const brandMatch = cleanedJson.match(/"brand"\s*:\s*{[^}]*"name"\s*:\s*"([^"]+)"/);

          // Extracted values with fallbacks
          const productName = productNameMatch ? productNameMatch[1] : "Unknown Product";
          const price = priceMatch ? priceMatch[1] : "Unknown Price";
          const brandName = brandMatch ? brandMatch[1] : "Unknown Brand";

          productDetails = {
              productName,
              platform: "Croma",
              brandName,
              price,
          };
      } else {
          console.log("No JSON-LD script found, product details might be limited.");
          productDetails = {
              platform: "Croma",
              productName: "Unknown Product",
              brandName: "Unknown Brand",
              price: "Unknown Price"
          };
      }


      // Fetch Bank Offers using Croma API (using the getBankOfferData logic)
      let bankOfferData = [];
      try {
          const itemId = productUrl.split('/').pop();
          const apiHeaders = {
              "Content-Type": "application/json",
              "Authorization": "8Tksadcs85ad4vsasfasgf4sJHvfs4NiKNKLHKLH582546f646", // Example authorization key - **Replace with a real key if you have one**
              "client_id": "CROMA",
          };

          const apiPayload = {
              getApplicablePromotionsForItemRequest: {
                  itemId,
                  programId: "01eae2ec-0576-1000-bbea-86e16dcb4b79",
                  channelIds: ["TCPCHS0003"],
                  status: "ACTIVE",
              },
          };
          const CROMA_API_URL = "https://api.tatadigital.com/getApplicablePromotion/getApplicationPromotionsForItemOffer";
          const apiResponse = await axios.post(CROMA_API_URL, apiPayload, { headers: apiHeaders, timeout: 10000 }); // 10 seconds timeout
          if (apiResponse.status !== 200) {
              throw new Error(`Croma API failed. Status Code: ${apiResponse.status}`);
          }

          const apiResponseData = apiResponse.data;

          if (apiResponseData.getApplicablePromotionsForItemResponse && apiResponseData.getApplicablePromotionsForItemResponse.offerDetailsList) {
              const allOffers = apiResponseData.getApplicablePromotionsForItemResponse.offerDetailsList;
              bankOfferData = allOffers.filter(offer => {
                  return offer.payment !== undefined;
              });
          }
          console.log("BankofferData Croma API fetched and filtered.");

      } catch (apiError) {
          console.error("Error fetching bank offers from Croma API:", apiError);
          bankOfferData = []; // If API fails, return empty array for bank offers, don't throw error for product data
      }

      // Extract only offer titles from bankOfferData
      const extractedOfferTitles = bankOfferData.map(offer => offer.offerTitle);


      return {
          platform: productDetails.platform,
          brandName: productDetails.brandName,
          productName: productDetails.productName,
          price: productDetails.price,
          offers: extractedOfferTitles // Include the offers array here
      };

  } catch (error) {
      console.error("Error in fetchCromaProductData:", error.message);
      return { error: "Failed to fetch and extract Croma product data", details: error.message };
  }
}

/**
 * Function to scrape VijaySales product details (Vijaysalescode)
 */

const extractVijaySalesData = async (url) => {
  try {
    // Fetch page data
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch page, status code: ${response.status}`);
    }

    // Load HTML using Cheerio
    const $ = cheerio.load(response.data);
    const jsonLdScripts = $('script[type="application/ld+json"]');

    if (jsonLdScripts.length < 7) {
      console.log("There are less than 7 JSON-LD scripts on the page.");
      return null;
    }

    // Extract product data from JSON-LD
    const jsonLdScript = $(jsonLdScripts[6]).html();
    const parsedData = JSON.parse(jsonLdScript);

    if (parsedData["@type"] !== "Product") {
      console.log("The JSON-LD script does not contain product data.");
      return null;
    }

    // Extract required fields
    const productUrl = parsedData.url || url;
    const brandName = parsedData.brand?.name || "Unknown";
    const productName = parsedData.name || "Unknown Product";
    const price = parsedData.offers?.price || "N/A";
    const platform = "Vijay Sales"; // Since it's always Vijay Sales

    // Extract product ID from URL
    const extractProductId = (url) => {
      const regex = /\/p\/P?(\d{6})\//;
      const match = url.match(regex);
      return match ? match[1] : null;
    };

    const productId = extractProductId(productUrl);
    if (!productId) {
      console.error('Invalid URL: No product ID found');
      return null;
    }

    // Fetch offers using GraphQL
    const graphqlUrl = 'https://mdm.vijaysales.com/api/graphql';
    const query = `
      query GetOffers {
          getOffers(sku: "${productId}") {
              jusPayOffer {
                  description
              }
          }
      }
    `;

    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'https://www.vijaysales.com',
      'Referer': productUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Brave";v="132"',
      'sec-ch-ua-platform': '"Windows"',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    const payload = { query, variables: {} };

    const offerResponse = await axios.post(graphqlUrl, payload, { headers });

    let offers = [];
    if (offerResponse.status === 200 && offerResponse.data?.data?.getOffers?.jusPayOffer?.length > 0) {
      offers = offerResponse.data.data.getOffers.jusPayOffer.map(offer => offer.description);
    }

    return {
      platform,
      brandName,
      productName,
      price,
      offers,
    };

  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
};

/**
 * Function to scrape Amazon product details (Vijaysalescode)
 */
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
  

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
