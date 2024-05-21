// handler is an example of setting CORS headers.
// For more information about CORS and CORS preflight requests, see
// https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request.

export const handler = async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (res.method === "OPTIONS") {
      // Send response to OPTIONS requests
      res.set("Access-Control-Allow-Methods", "GET");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      res.status(204).send("");
    } else {
      res.send("Hello World!");
    }
    // Prepare the response JSON
    const responseJson = {
      message: "Hello World",
    };

    // Set the response headers
    res.setHeader("Content-Type", "application/json");

    // Send the response JSON
    res.end(JSON.stringify(responseJson));
  } catch (error) {
    // Handle errors
    console.error(error);
    // Send an error response if needed
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Internal Server Error");
  }
};
