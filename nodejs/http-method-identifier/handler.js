export const handler = async (event, context) => {
  try {
    // Determine the HTTP method
    const method = event.method;

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
    context.setHeader("Content-Type", "application/json");

    // Send the response JSON
    context.end(JSON.stringify(responseJson));
  } catch (error) {
    // Handle errors
    console.error(error);
    // Send an error response if needed
    context.statusCode = 500;
    context.setHeader("Content-Type", "text/plain");
    context.end("Internal Server Error");
  }
};
