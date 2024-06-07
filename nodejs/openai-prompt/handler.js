import axios from 'axios';

// Handler function
async function handler(req, res) {
  try {
    let { prompt, max_tokens, temperature, model, token } = req.body;
    token = process.env.OPENAI_API_KEY || token;

    // Validate input
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Invalid prompt" });
    }

    // Validate token
    if (!token) {
      return res.status(400).json({ error: "OpenAI API key is required" });
    }

    // Prepare request options
    const options = {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // Replace with your OpenAI API key
      },
      data: {
        model: model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
      },
    };

    // Make HTTP request
    const response = await axios(options);

    // Return response from OpenAI
    res.json(response.data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export { handler };
