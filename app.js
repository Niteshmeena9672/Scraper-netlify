const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Function to extract Ajio product data

const extractAjioData = ($) => {
  const metaDescription = $('meta[name="description"]').attr("content");
  const ogDescription = $('meta[property="og:description"]').attr("content");
  const twitterDescription = $('meta[name="twitter:description"]').attr(
    "content"
  );

  return `
    <div class="descriptions">
      <p><strong>Meta Description:</strong> ${
        metaDescription || "Not available"
      }</p>
      <p><strong>OG Description:</strong> ${
        ogDescription || "Not available"
      }</p>
      <p><strong>Twitter Description:</strong> ${
        twitterDescription || "Not available"
      }</p>
    </div>
  `;
};

// Function to extract Nykaa product data
const extractNykaaData = ($) => {
  const metaDescription = $('meta[name="description"]').attr("content");
  const ogDescription = $('meta[property="og:description"]').attr("content");
  const twitterDescription = $('meta[name="twitter:description"]').attr(
    "content"
  );
  const title = $("title").text();
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const twitterTitle = $('meta[property="twitter:title"]').attr("content");
  const productPrice = $('meta[property="product:price:amount"]').attr(
    "content"
  );
  const currency = $('meta[property="product:price:currency"]').attr("content");
  const productUrl = $('meta[property="og:url"]').attr("content");

  return `
    <div class="product-details">
      <h1>Product Name: ${title}</h1>
      <p><strong>Product URL:</strong> <a href="${productUrl}">${productUrl}</a></p>
      <p><strong>Price:</strong> ₹${productPrice || "N/A"}</p>
      <p><strong>Currency:</strong> ${currency || "N/A"}</p>
      <p><strong>Meta Description:</strong> ${
        metaDescription || "Not available"
      }</p>
      <p><strong>OG Description:</strong> ${
        ogDescription || "Not available"
      }</p>
      <p><strong>Twitter Description:</strong> ${
        twitterDescription || "Not available"
      }</p>
    </div>
  `;
};

const extractVijaySalesData = async (productUrl, $) => { 
  const jsonLdScripts = $('script[type="application/ld+json"]');

  if (jsonLdScripts.length >= 7) {
    const jsonLdScript = $(jsonLdScripts[6]).html();
    try {
      const parsedData = JSON.parse(jsonLdScript);
      if (parsedData["@type"] === "Product") {
        const productData = parsedData;

        // Extract product ID from URL
        const extractProductId = (url) => {
          const regex = /\/p\/P?(\d{6})\//;
          const match = url.match(regex);
          return match ? match[1] : null;
        };

        const productId = extractProductId(productUrl);
        if (!productId) {
          console.error('Invalid URL: No product ID found');
          return;
        }

        const graphqlUrl = 'https://mdm.vijaysales.com/api/graphql';
        const query = `
          query GetOffers {
              getOffers(sku: "${productId}") {
                  jusPayOffer {
                      description
                      title
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

        try {
          const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });

          let offers = "No offers available";
          if (response.ok) {
            const responseData = await response.json();
            if (responseData.data?.getOffers?.jusPayOffer?.length > 0) {
              offers = responseData.data.getOffers.jusPayOffer.map(offer => `<p><strong>Offer:</strong> ${offer.title} - ${offer.description}</p>`).join('');
            }
          }

          return `
            <div class="product-details">
              <h1>Product Name: ${productData.name}</h1>
              <p><strong>Product URL:</strong> <a href="${productData.url}">${productData.url}</a></p>
              <p><strong>Price:</strong> ₹${productData.offers ? productData.offers.price : "N/A"}</p>
              <p><strong>Availability:</strong> ${productData.offers ? productData.offers.availability : "N/A"}</p>
              ${offers}
            </div>
            <script type="application/ld+json">
              ${JSON.stringify(productData)}
            </script>
          `;
        } catch (error) {
          console.error('Error making the request: ', error);
        }
      } else {
        console.log("The 7th JSON-LD script does not contain product data.");
      }
    } catch (err) {
      console.error("Error parsing JSON-LD script:", err);
    }
  } else {
    console.log("There are less than 7 JSON-LD scripts on the page.");
  }
  return "";
};



const fetchAndExtractCromaData = async (productUrl, $) => {
  try {
    // Extract JSON-LD data from the HTML document
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let extractedData = null;
    if (jsonLdScripts.length > 0) {
      extractedData = $(jsonLdScripts[0]).html();
      console.log("extracted data Croma: ", extractedData);
    } else {
      console.log("No JSON-LD script found");
    }

    // Fetch product data from Croma API
    const itemId = productUrl.split('/').pop();
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "8Tksadcs85ad4vsasfasgf4sJHvfs4NiKNKLHKLH582546f646", // Example authorization key
      "client_id": "CROMA",
    };

    const payload = {
      getApplicablePromotionsForItemRequest: {
        itemId,
        programId: "01eae2ec-0576-1000-bbea-86e16dcb4b79",
        channelIds: ["TCPCHS0003"],
        status: "ACTIVE",
      },
    };
    const CROMA_API_URL = "https://api.tatadigital.com/getApplicablePromotion/getApplicationPromotionsForItemOffer";
    const response = await axios.post(CROMA_API_URL, payload, { headers, timeout: 10000 }); // 10 seconds timeout
    if (response.status !== 200) {
      throw new Error(`Failed to fetch data. Status Code: ${response.status}`);
    }

    const BankOfferData = response.data;
    
    // Generate HTML response
    const htmlResponse = `
      <html>
        <body>
          <h2>Product Data</h2>
          <pre>${JSON.stringify(productData, null, 2)}</pre>
          <h2>Bank Offer</h2>
          <pre>${extractedData ? extractedData : 'No JSON-LD Data Available'}</pre>
        </body>
      </html>
    `;

    return htmlResponse;
  } catch (error) {
    console.error("Error in fetchAndExtractCromaData:", error.message);
    throw new Error('Failed to fetch and extract Croma data');
  }
};


// *********

const extractTataCliq = async (productUrl) => { 
  // console.log("tata cliq function");
  try {
    // Extract item_id from product URL
    const itemId = productUrl.split('-').pop();
    
    // Construct the redirected link
    const baseRedirectedLink = `https://www.tatacliq.com/marketplacewebservices/v2/mpl/products/productDetails/${itemId}?isPwa=true&isMDE=true&isDynamicVar=true`;
    
    // Fetch product details from API
    const response = await fetch(baseRedirectedLink);
    const content = await response.json();
    console.log("tata cliq content : ", content);

    // Extract brand name, product name, and price
    const brandName = content.brandName || "Unknown Brand";
    const productName = content.productName || "Unknown Product";
    const price = content.winningSellerPrice?.value || "Price not available";

    const sellerId = content.winningSellerID;
    const brandCode = content.brandURL.split('-').pop();
    
    let categoryCode = '';
    const listOfAllCategories = content.categoryHierarchy;
    const allOffers = new Set();

    // Loop through all categories and fetch offers
    for (const category of listOfAllCategories) {
      categoryCode = category.category_id;

      // Construct the redirected link for offers
      const redirectedLink = `https://www.tatacliq.com/recommendationengine/offers?productCode=${itemId}&sellerId=${sellerId}&categoryCode=${categoryCode}&brandCode=${brandCode}&price=${price}&neuPassFlag=true`;

      // Fetch offers
      const offersResponse = await fetch(redirectedLink);
      const offersData = await offersResponse.json();

      const fetchtataCliqBankOffers = (listOfOffers, allOffers) => {
        for (const offer of listOfOffers) {
          allOffers.add(offer.offerHighlights);
        }
      };
      // Check and add available offers to the set
      if (offersData.bestDeals?.offers?.length > 0) {
        fetchtataCliqBankOffers(offersData.bestDeals.offers, allOffers);
      }
      if (offersData.otherOffers?.length > 0) {
        fetchtataCliqBankOffers(offersData.otherOffers, allOffers);
      }
      if (offersData.bankofferList?.length > 0) {
        fetchtataCliqBankOffers(offersData.bankofferList, allOffers);
      }
    }

    // Check if there are any offers
    let offerDetails = "Currently, there are no offers available for this product.";
    if (allOffers.size > 0) {
      offerDetails = Array.from(allOffers).join(', ');
    }

    return `<div>
              <p><strong>Brand Name:</strong> ${brandName}</p>
              <p><strong>Product Name:</strong> ${productName}</p>
              <p><strong>Price:</strong> ₹${price}</p>
              <p><strong>Platform:</strong> TataCliq</p>
              <p><strong>Offer:</strong> ${offerDetails}</p>
            </div>`;
  } catch (error) {
    console.error("Error extracting TataCliq data:", error);
    return `An error occurred: ${error.message}`;
  }
};



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

const extractAmazonData = async (productLink,$) => {
  try {
    

    // Fetch the product page HTML with retries
    
    const platform = "Amazon";

    const title = $("#productTitle").text().trim() || "Not available";
    const price =
      $(".a-price .a-offscreen").first().text().trim() || "Not available";
    const metaDescription =
      $('meta[name="description"]').attr("content") || "Not available";
    const ogDescription =
      $('meta[property="og:description"]').attr("content") || "Not available";
    const twitterDescription =
      $('meta[name="twitter:description"]').attr("content") || "Not available";

    // Extract ASIN from the product link
    const asinMatch = productLink.match(/\/dp\/([^/]+)\//);
    if (!asinMatch) {
      return `<p>Invalid product link. ASIN not found.</p>`;
    }

    const asin = asinMatch[1];

    // Fetch Bank Offers
    let bankOffersHtml = "<p>Currently, there are no bank offers available for this product.</p>";
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

      const extractedContent = [];
      paragraphs.each((i, el) => {
        extractedContent.push(bank$(el).text().trim());
      });

      if (extractedContent.length > 0) {
        bankOffersHtml = `<ul>${extractedContent.map((offer) => `<li>${offer}</li>`).join("")}</ul>`;
      }
    } catch (error) {
      console.warn("Failed to fetch bank offers:", error.message);
    }

    // Return formatted HTML output
    return `
      <div class="amazon-data">
        <h2>Platform: ${platform}</h2>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Price:</strong> ${price}</p>
        <p><strong>Meta Description:</strong> ${metaDescription}</p>
        <p><strong>OG Description:</strong> ${ogDescription}</p>
        <p><strong>Twitter Description:</strong> ${twitterDescription}</p>
        <h3>Bank Offers:</h3>
        ${bankOffersHtml}
      </div>
    `;
  } catch (error) {
    return `<p>An error occurred while fetching product data: ${error.message}</p>`;
  }
};

// Example usage



const extractFlipkartData = ($) => {
  const platform = "Flipkart";

  const title = $("h1._6EBuvT span.VU-ZEz").text().trim() || "Not available";
  const price = $("div.Nx9bqj.CxhGGd").text().trim() || "Not available";

  // Extract offer details
  const offers = [];
  $(".+-2B3d.row").each((index, element) => {
    offers.push($(element).text().trim());
  });

  // Convert offers to a formatted string or keep it as an array
  const offersText =
    offers.length > 0 ? offers.join(", ") : "No offers available";
  // console.log("offer ,", offersText);
  return `
    <div class="flipkart-data">
      <h2>Platform: ${platform}</h2>
      <p><strong>Title:</strong> ${title}</p>
      <p><strong>Price:</strong> ${price}</p>
      <p><strong>Offers:</strong> ${offersText}</p>
    </div>
  `;
};


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
          brand = jsonData?.brand?.name || "Extract Brand Name from Product Name";
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
      console.log("offerApi: ", offerApiUrl);

      try {
        const offerResponse = await axios.get(offerApiUrl, { headers });
    
        // Extract bank offers
        offers = offerResponse.data?.data?.bank_offers?.map(
          (offer) => offer.offer_desc
        ) || [];
    
        // // Extract best plans
        // const bestPlans = offerResponse.data?.data?.best_plan;
    
        // if (Array.isArray(bestPlans)) {
        //   bestPlans.forEach((bestPlan) => {
        //     offers.push(`
        //       <div class="best-plan">
        //         <p><strong>Bank:</strong> ${bestPlan.bank_name}</p>
        //         <p><strong>Card:</strong> ${bestPlan.card_name}</p>
        //         <p><strong>Offer Amount:</strong> ₹${bestPlan.offer_amount}</p>
        //       </div>
        //     `);
        //   });
        // } else if (bestPlans) {
        //   offers.push(`
        //     <div class="best-plan">
        //       <p><strong>Bank:</strong> ${bestPlans.bank_name}</p>
        //       <p><strong>Card:</strong> ${bestPlans.card_name}</p>
        //       <p><strong>Offer Amount:</strong> ₹${bestPlans.offer_amount}</p>
        //     </div>
        //   `);
        // }
    
        // Extract EMI data and include only required details (Bank Name, Card Name, Offer Amount)
        const emiData = offerResponse.data?.data?.emi_data;
        if (emiData) {
          for (const [cardName, emiDetails] of Object.entries(emiData)) {
            emiDetails
              .filter((emi) => emi.emi_type === "FULL_SWIPE") // Only include FULL_SWIPE EMI types
              .forEach((emi) => {
                offers.push(`
                  <div class="emi-plan">
                    <p><strong>Bank:</strong> ${emi.bank_name}</p>
                    <p><strong>Card:</strong> ${emi.card_name}</p>
                    <p><strong>Offer Amount:</strong> ₹${emi.offer_amount}</p>
                  </div>
                `);
              });
          }
        }
        
    
        // Format offers into HTML text
        const offersText = offers.length > 0 ? offers.join(", ") : "No offers available";
    
        // Generate result HTML
        const resultHTML = `
          <div class="reliance-data">
            <h2>Platform: Reliance Digital</h2>
            <p><strong>Product:</strong> ${productName}</p>
            <p><strong>Brand:</strong> ${brand}</p>
            <p><strong>Price:</strong> ₹${price}</p>
            <p><strong>Offers:</strong> ${offersText}</p>
          </div>
        `;
    
        return resultHTML;
    } catch (error) {
        console.error("Failed to fetch offers:", error);
    }
    
    }
  } catch (error) {
    console.error("Error fetching Reliance Digital data:", error);
  }

  return { Platform: "Reliance Digital", error: "Failed to fetch data" };
}


const extractStructuredData = async ($) => {
  let name = "", brand = "", price = "";

  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const scriptContent = $(script).html();
      const data = JSON.parse(scriptContent);
      if (data["@type"] === "Product") {
        if (data.offers?.price) price = data.offers.price;
        if (data.brand) brand = data.brand;
        if (data.name) name = data.name;
      }
    } catch (err) {
      console.error("JSON parse error in structured data:", err.message);
    }
  });

  return { name, brand, price };
};


// Helper function to extract values from nested JSON paths
const extractDataFromPaths = (jsonData, paths, key, descriptions) => {
  for (const path of paths) {
    let currentData = jsonData;
    const segments = path.split(".");
    for (const segment of segments) {
      if (currentData && typeof currentData === "object" && segment in currentData) {
        currentData = currentData[segment];
      } else {
        currentData = null;
        break;
      }
    }
    if (Array.isArray(currentData)) {
      currentData.forEach((item) => {
        if (item[key]) descriptions.add(item[key]);
      });
    }
  }
};
const extractRelevantHtml = async (html, url) => {
  const $ = cheerio.load(html);

  if (url.includes("ajio")) {
    return extractAjioData($);
  } else if (url.includes("nykaa")) {
    return extractNykaaData($);
  } else if (url.includes("vijaysales")) {
    return extractVijaySalesData(url,$);
  } else if (url.includes("amazon")) {
    return extractAmazonData(url,$);
  } else if (url.includes("croma")) {
    return fetchAndExtractCromaData(url,$);
  } else if (url.includes("tatacliq")) {
    return extractTataCliq(url);
  } else if (url.includes("reliancedigital")) {
    return await fetchProductDataReliancedigital(url); // 🔹 Ensure we await the Promise
  } else if (url.includes("flipkart")) {
    return extractFlipkartData($);
  } else {
    // Default logic for other websites
    const metaDescription = $('meta[name="description"]').attr("content");
    const ogDescription = $('meta[property="og:description"]').attr("content");
    const twitterDescription = $('meta[name="twitter:description"]').attr(
      "content"
    );

    return `
      <div class="descriptions">
        <p><strong>Meta Description:</strong> ${
          metaDescription || "Not available"
        }</p>
        <p><strong>OG Description:</strong> ${
          ogDescription || "Not available"
        }</p>
        <p><strong>Twitter Description:</strong> ${
          twitterDescription || "Not available"
        }</p>
      </div>
    `;
  }
};

// Function to send OpenAI requests for extracting relevant details from the HTML
const openAIRequest = async (html, prompt) => {
  try {
    console.log("Open AI html data,", html);
    const payload = {
      model: "gpt-4o", // Adjust model if necessary, e.g., 'gpt-3.5-turbo'
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nHTML:\n${html}`, // Including the HTML in the request
        },
      ],
      max_tokens: 16000, // Adjust token limit based on expected response size
    };

    const headers = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Use your actual environment variable for OpenAI key
      "Content-Type": "application/json",
    };

    // Sending request to OpenAI API
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      { headers }
    );

    // Get token usage from the response
    const tokensUsed = response.data.usage.total_tokens;
    // console.log(`Tokens used in this request: ${tokensUsed}`);
    // console.log(response.data.choices[0]?.message?.content.trim());
    // Return the content from the response
    return (
      response.data.choices[0]?.message?.content.trim() || "No data extracted"
    );
  } catch (err) {
    console.error("OpenAI API Error:", err.response?.data || err.message);
    throw new Error("Failed to process HTML with OpenAI");
  }
};

// Scrape endpoint for scraping data from a given URL
exports.handler = async (event) => {
  const queryStringParameters = event.queryStringParameters || {};
  const { url } = queryStringParameters;

  // Check if URL is provided
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "URL is required" }),
    };
  }
  
  try {
    let html;
    if (
      url.includes("nykaa") ||
      url.includes("flipkart") ||
      url.includes("croma") ||    url.includes("amazon") 
    ) {
      // url.includes("tatacliq")
      // Fetch data using ScraperAPI
      const API_KEY = process.env.SCRAPER_API_KEY; // Replace with your ScraperAPI key
      const response = await axios.get("http://api.scraperapi.com", {
        params: {
          api_key: API_KEY,
          url: url,
        },
      });
      html = response.data; // HTML data returned by ScraperAPI
    } else {
      // Direct axios scraping for other sites
      const { data: scrapedHtml } = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      html = scrapedHtml;
    }

    // Extract relevant HTML using your extraction function
    const relevantHtml = await extractRelevantHtml(html, url);



    // Send merged data to OpenAI for processing
    const prompt = `Extract product details, bank offer details, and other relevant information from the provided object data, JSON, HTML, or text. You need to extract the following data:
    - Platform name (like croma, flipkart, amazon, vijaySales, TataCliq, Reliance Digital .. etc )
    - Brand name
    - Product name
    - Price (only number, no symbols)
    - Offers (Any product or bank offers available)
    Just return the extracted data without any errors.`;

   
    const extractedData = await openAIRequest(relevantHtml, prompt);


    // Format the response
    //const formattedResponse = formatChatGPTResponse(extractedData);

    // Return the final response in Lambda format
    return {
      statusCode: 200,
      body: JSON.stringify(extractedData),
    };
  } catch (err) {
    console.error("Scraping Error:", err.message);

    // Return error response in Lambda format
    return {
      statusCode: 500,
      body: JSON.stringify({
        statusCode: 500,
        message: "Failed to scrape or process data",
        body: {},
      }),
    };
  }
};


const formatChatGPTResponse = (chatGPTResponse) => {
  try {
    // Strip any markdown formatting (like ```json {...}`) from the response
    const cleanedResponse = chatGPTResponse.replace(
      /```[a-zA-Z0-9]*\n|\n```/g,
      ""
    );

    // Attempt to parse the cleaned response as valid JSON
    const extractedData = JSON.parse(cleanedResponse);

    // Check if the required fields are available
    const formattedResponse = {
      statusCode: 200,
      message: "Data extracted successfully",
      body: {
        platform: extractedData.body.platform || "Not available",
        brand: extractedData.body.brand || "Not available",
        productName: extractedData.body.productName || "Not available",
        price: extractedData.body.price || "Not available",
        offers: extractedData.body.offers || "Not available",
      },
    };

    return formattedResponse;
  } catch (err) {
    console.error("Error formatting response:", err.message);

    // Return a generic response indicating failure if parsing fails
    return {
      statusCode: 500,
      message: "Failed to format data",
      body: {},
    };
  }
};

// Start the server and listen on the specified port
// app.listen(PORT, () => {
//  console.log(`Server running on http://localhost:${PORT}`);
// });
