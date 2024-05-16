export const handler = async (event, context) => {
  try {
    // Set a timeout delay in milliseconds
    const delay = 1000; // 1 second

    // Create a promise that resolves after the delay
    const timeoutPromise = () =>
      new Promise((resolve) => setTimeout(resolve, delay));

    console.log("Starting execution...");

    // Wait for the delay to pass
    await timeoutPromise();

    console.log("Execution resumed after delay.");

    const responseJson = {
      message: "Function executed with intentional delay.",
    };

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
