# Import the required modules
from flask import jsonify

# Define the handler function
def handler(request):
    # Extract data from the request if needed
    # For example, if the request contains JSON data:
    # data = request.json

    # Create the response JSON
    response_json = {
        'message': 'Hello World'
    }

    # Return a JSON response
    return jsonify(response_json)
