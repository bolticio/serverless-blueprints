// Define the handler function
export const handler = async (event, context) => {
    try {
        // Prepare the response JSON
        const responseJson = {
            message: "Hello World"
        };

        // Set the response headers
        context.setHeader('Content-Type', 'application/json');

        // Send the response JSON
        context.end(JSON.stringify(responseJson));
    } catch (error) {
        // Handle errors
        console.error(error);
        // Send an error response if needed
        context.statusCode = 500;
        context.setHeader('Content-Type', 'text/plain');
        context.end('Internal Server Error');
    }
};
