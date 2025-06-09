export const handler = async (req, res) => {
  try {
    // Sends 'bar' as response
    res.send(process.env.FOO);
  } catch (error) {
    // Handle errors
    console.error(error);
    // Send an error response if needed
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Internal Server Error");
  }
};
