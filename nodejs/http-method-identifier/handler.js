export const handler = async (req, res) => {
  try {
    // Determine the HTTP method
    const method = req.method;

    let message;
    if (method === "GET") {
      message = "GET method called.";
    } else if (method === "POST") {
      message = "POST method called.";
    } else if (method === "PUT") {
      message = "PUT method called.";
    } else if (method === "DELETE") {
      message = "DELETE method called.";
    } else if (method === "PATCH") {
      message = "PATCH method called.";
    } else {
      message = "Unsupported method.";
    }

    // Set the response JSON
    const responseJson = { message };

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
