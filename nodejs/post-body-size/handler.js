// Define the handler function
export const handler = async (req, res) => {
  try {
    // Safely stringify the body if it's an object
    let bodyRaw = req.body || "";
    if (typeof bodyRaw !== "string") {
      bodyRaw = JSON.stringify(bodyRaw);
    }

    // Calculate size in bytes and MB
    const bodySizeBytes = Buffer.byteLength(bodyRaw, "utf8");
    const bodySizeMB = (bodySizeBytes / (1024 * 1024)).toFixed(4); // 2 decimal places

    // Log the size
    console.log(
      `Received body size: ${bodySizeBytes} bytes | (${bodySizeMB} MB)`
    );

    // Prepare the response JSON
    const responseJson = {
      message: "Body size calculated successfully",
      bodySizeBytes,
      bodySizeMB: parseFloat(bodySizeMB),
    };

    // Print the JSON response to stdout
    console.log(JSON.stringify(responseJson));

    // Set the response headers
    res.setHeader("Content-Type", "application/json");

    // Send the response JSON
    res.end(JSON.stringify(responseJson));
  } catch (error) {
    // Handle errors
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Internal Server Error");
  }
};
