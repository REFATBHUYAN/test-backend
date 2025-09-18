import axios from 'axios'

async function scrapeLinkedinProfile(linkedinProfileUrl) {
    const apiEndpoint = 'https://nubela.co/proxycurl/api/v2/linkedin';
    const apiKey = "C0aVwW7J_YRIH8ItAwct8g";
    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await axios.get(apiEndpoint, {
            params: { url: linkedinProfileUrl },
            headers: headers
        });

        let data = response.data;
        

        return data;
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Example usage
const linkedinProfileUrl = 'https://www.linkedin.com/in/aarav-shukla/';
scrapeLinkedinProfile(linkedinProfileUrl)
    .then(data => {
        console.log('Scraped data:', data);
    })
    .catch(error => {
        console.error('Error occurred:', error);
    });
