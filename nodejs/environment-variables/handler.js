export const handler = async (event, context) => {
  try {
    // Sends 'bar' as response
    res.send(process.env.FOO);
  } catch (error) {
    // Handle errors
    console.error(error);
    // Send an error response if needed
    context.statusCode = 500;
    context.setHeader("Content-Type", "text/plain");
    context.end("Internal Server Error");
  }
};
