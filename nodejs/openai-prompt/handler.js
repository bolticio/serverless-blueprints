import { request as httpsRequest } from "https";

function makeHttpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const protocol = httpsRequest;

    const req = protocol(options, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: responseBody,
        });
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// Handler function
async function handler(req, res) {
  try {
    const { prompt, max_tokens, temperature, model, token } = req.body;

    // Validate input
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Invalid prompt" });
    }

    // Prepare request options
    const options = {
      hostname: "api.openai.com",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${token}`, // Replace with your OpenAI API key
      },
    };

    // Make HTTP request
    const responseBody = await makeHttpRequest(
      options,
      JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
      })
    );

    // Return response from OpenAI
    res.json(JSON.parse(responseBody.body));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export { handler };
